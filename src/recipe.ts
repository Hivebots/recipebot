import lcs = require('longest-common-substring');
import { convertIngredient } from "./weightsAndMeasures";
import { recipesRaw } from './recipes';
const recipes = recipesRaw as Partial<Recipe>[];

//convertIngredient("1oz cheese", "metric");
//convertIngredient("1lb cheese", "metric");
//convertIngredient("10g cheese", "imperial");
convertIngredient("10floz milk", "metric");

interface Recipe {
    name: string,
    description: string,
    cookTime: string,
    cookingMethod: string;
    nutrition: NutritionInformation,
    prepTime: string,
    recipeCategory: string,
    recipeCuisine: string,
    recipeIngredient: string[],
    recipeInstructions: string[],
    recipeYield: string,
    suitableForDiet: string,
    totalTime: string
}

interface NutritionInformation {
    calories: number,
    carbohydrateContent: number,
    cholesterolContent: number,
    fatContent: number,
    fiberContent: number,
    proteinContent: number,
    saturatedFatContent: number,
    servingSize: string,
    sodiumContent: number,
    sugarContent: number,
    transFatContent: number,
    unsaturatedFatContent: number
}

import { Observable } from 'rxjs';
import { UniversalChat, Message, CardAction, Address, getAddress, IChatSession, WebChatConnector,  RE, REArgs } from 'prague';

const webChat = new WebChatConnector()
window["browserBot"] = webChat.botConnection;

// setTimeout(() => chat.send("Let's get cooking!"), 1000);

import { Store, createStore, combineReducers, Action, Reducer } from 'redux';

type PartialRecipe = Partial<Recipe>;

interface RecipeState {
    recipe: PartialRecipe,
    lastInstructionSent: number,
    promptKey: string
}

import { ChatState, ReduxChat, ReduxChatSession } from 'prague';

type RecipeBotData = ChatState<undefined, undefined, undefined, undefined, RecipeState>;

interface AppState {
    bot: RecipeBotData;
}

type RecipeBotSession = ReduxChatSession<AppState, RecipeBotData>;

type RecipeAction = {
    type: 'Set_Recipe',
    recipe: PartialRecipe,
} | {
    type: 'Set_Instruction',
    instruction: number,
} | {
    type: 'Set_PromptKey',
    promptKey: string,
}

const recipebot: Reducer<RecipeBotData> = (
    state: RecipeBotData = {
        userInConversation: {
            recipe: undefined,
            lastInstructionSent: undefined,
            promptKey: undefined
        }
    },
    action: RecipeAction
) => {
    switch (action.type) {
        case 'Set_Recipe': {
            return {
                ... state, 
                userInConversation: {
                    ... state.userInConversation,
                    recipe: action.recipe,
                    lastInstructionSent: undefined
                }};
        }
        case 'Set_Instruction': {
            return {
                ... state, 
                userInConversation: {
                    ... state.userInConversation,
                    lastInstructionSent: action.instruction
                }};
        }
        case 'Set_PromptKey': {
            return {
                ... state, 
                userInConversation: {
                    ... state.userInConversation,
                    promptKey: action.promptKey
                }};
        }
        default:
            return state;
    }
}

const store = createStore(
    combineReducers<AppState>({
        bot: recipebot
    })
);

const recipeBotChat = new ReduxChat(new UniversalChat(webChat.chatConnector), store, state => state.bot);

import { executeRule, Handler, defaultRule, always, rule, Queries, firstMatch, filter } from 'prague';

const reply = (text: string): Handler<IChatSession> => (session) => session.reply(text);

// Prompts

import { ChoiceLists, PromptRulesMaker, Prompt } from 'prague';

const recipeChoiceLists: ChoiceLists = {
    'Cheeses': ['Cheddar', 'Wensleydale', 'Brie', 'Velveeta']
}

const recipePromptRules: PromptRulesMaker<RecipeBotSession> = prompt => ({
    'Favorite_Color': prompt.text((session, args) =>
        session.reply(args['text'] === "blue" ? "That is correct!" : "That is incorrect"),
    ),
    'Favorite_Cheese': prompt.choice('Cheeses', (session, args) =>
        session.reply(args['choice'] === "Velveeta" ? "Ima let you finish but FYI that is not really cheese." : "Interesting.")
    ),
    'Like_Cheese': prompt.confirm((session, args) =>
        session.reply(args['confirm'] ? "That is correct." : "That is incorrect.")
    ),
});

const prompt = new Prompt<RecipeBotSession>(
    recipeChoiceLists,
    recipePromptRules,
    (session) => session.data.userInConversation.promptKey,
    (session, promptKey) => session.store.dispatch<RecipeAction>({ type: 'Set_PromptKey', promptKey })
);

// Intents

// Message handlers

const chooseRecipe = (session: RecipeBotSession, args: REArgs) => {
    const name = args.groups[1];
    const recipe = recipeFromName(name);
    if (recipe) {
        session.store.dispatch<RecipeAction>({ type: 'Set_Recipe', recipe });

        return Observable.from([
            `Great, let's make ${name} which ${recipe.recipeYield.toLowerCase()}!`,
            "Here are the ingredients:",
            ... recipe.recipeIngredient,
            "Let me know when you're ready to go."
        ])
        // .zip(Observable.timer(0, 1000), x => x) // Right now we're having trouble introducing delays
        .do(ingredient => session.reply(ingredient))
        .count();
    } else {
        return session.replyAsync(`Sorry, I don't know how to make ${name}. Maybe one day you can teach me.`);
    }
}

const queryQuantity: Handler<RecipeBotSession> = (session, args: REArgs) => {
    const ingredientQuery = args.groups[1].split('');

    const ingredient = session.data.userInConversation.recipe.recipeIngredient
        .map<[string, number]>(i => [i, lcs(i.split(''), ingredientQuery).length])
        .reduce((prev, curr) => prev[1] > curr[1] ? prev : curr)
        [0];

    session.reply(ingredient);
}

const nextInstruction: Handler<RecipeBotSession> = (session, args: REArgs) => {
    const nextInstruction = session.data.userInConversation.lastInstructionSent + 1;
    if (nextInstruction < session.data.userInConversation.recipe.recipeInstructions.length)
        sayInstruction(session, { instruction: nextInstruction });
    else
        session.reply("That's it!");
}

const previousInstruction: Handler<RecipeBotSession> = (session, args: REArgs) => {
    const prevInstruction = session.data.userInConversation.lastInstructionSent - 1;
    if (prevInstruction >= 0)
        sayInstruction(session, { instruction: prevInstruction });
    else
        session.reply("We're at the beginning.");
}

const sayInstruction: Handler<RecipeBotSession> = (session, args: { instruction: number }) => {
    session.reply(session.data.userInConversation.recipe.recipeInstructions[args.instruction]);
    if (session.data.userInConversation.recipe.recipeInstructions.length === args.instruction + 1)
        session.reply("That's it!");
    store.dispatch<RecipeAction>({ type: 'Set_Instruction', instruction: args.instruction });
}

const globalDefaultRule = defaultRule(reply("I can't understand you. It's you, not me. Get it together and try again."));

const recipeFromName = (name: string) =>
    recipes.find(recipe => recipe.name.toLowerCase() === name.toLowerCase());

const queries: Queries<RecipeBotSession> = {
    always: always,
    noRecipe: (session) => !session.data.userInConversation.recipe,
    noInstructionsSent: (session) => session.data.userInConversation.lastInstructionSent === undefined,
}

// RegExp

const intents = {
    instructions: {
        start: /(Let's start|Start|Let's Go|Go|I'm ready|Ready|OK|Okay)\.*/i,
        next: /(Next|What's next|next up|OK|okay|Go|Continue)/i,
        previous: /(go back|back up|previous)/i,
        repeat: /(what's that again|huh|say that again|please repeat that|repeat that|repeat)/i,
        restart: /(start over|start again|restart)/i
    },
    chooseRecipe: /I want to make (?:|a|some)*\s*(.+)/i,
    queryQuantity: /how (?:many|much) (.+)/i,
    askQuestion: /ask/i,
    askYorNQuestion: /yorn/i,
    askChoiceQuestion: /choice/i,
    all: /(.*)/i
}

const re = new RE<RecipeBotSession>();

// LUIS

import { LUIS } from 'prague';

const luis = new LUIS<RecipeBotSession>({
    name: 'testModel',
    id: 'id',
    key: 'key'
});

const recipeRule = firstMatch(

    // Prompts
    prompt.rule(),

    // For testing Prompts
    filter(queries.always, firstMatch(
        re.rule(intents.askQuestion, (session) => prompt.textCreate(session, 'Favorite_Color', "What is your favorite color?")),
        re.rule(intents.askYorNQuestion, (session) => prompt.confirmCreate(session, 'Like_Cheese', "Do you like cheese?")),
        re.rule(intents.askChoiceQuestion, (session) => prompt.choiceCreate(session, 'Favorite_Cheese', 'Cheeses', "What is your favorite cheese?"))
    )),

    // For testing LUIS

    filter(queries.always, luis.rule('testModel', [
        luis.intent('singASong', (session, args) => session.reply(`Let's sing ${args.song}`)),
        luis.intent('findSomething', (session, args) => session.reply(`Okay let's find a ${args.what} in ${args.where}`))
    ])),

    // If there is no recipe, we have to pick one
    filter(queries.noRecipe, firstMatch(
        re.rule(intents.chooseRecipe, chooseRecipe),
        re.rule([intents.queryQuantity, intents.instructions.start, intents.instructions.restart], reply("First please choose a recipe")),
        re.rule(intents.all, chooseRecipe)
    )),

    // Now that we have a recipe, these can happen at any time
    filter(queries.always,
        re.rule(intents.queryQuantity, queryQuantity), // TODO: conversions go here
    ),

    // If we haven't started listing instructions, wait for the user to tell us to start
    filter(queries.noInstructionsSent,
        re.rule([intents.instructions.start, intents.instructions.next], (session, args) => sayInstruction(session, { instruction: 0 }))
    ),

    // We are listing instructions. Let the user navigate among them.
    filter(queries.always, firstMatch(
        re.rule(intents.instructions.next, nextInstruction),
        re.rule(intents.instructions.repeat, (session, args) => sayInstruction(session, { instruction: session.data.userInConversation.lastInstructionSent })),
        re.rule(intents.instructions.previous, previousInstruction),
        re.rule(intents.instructions.restart, (session, args) => sayInstruction(session, { instruction: 0 })),
        globalDefaultRule
    ))

);

recipeBotChat.session$
.do(session => console.log("message", session.message))
.do(session => console.log("state before", session.state))
.flatMap(session =>
    executeRule(session, recipeRule)
    .do(_ => console.log("state after", session.store.getState()))
)
.subscribe();
