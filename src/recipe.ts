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
import { UniversalChat, Message, CardAction, Address, getAddress, IChatInput, WebChatConnector,  RE, REArgs } from 'prague';

const webChat = new WebChatConnector()
window["browserBot"] = webChat.botConnection;

// setTimeout(() => chat.send("Let's get cooking!"), 1000);

import { Store, createStore, combineReducers, Reducer } from 'redux';

type PartialRecipe = Partial<Recipe>;

interface RecipeState {
    recipe: PartialRecipe,
    lastInstructionSent: number,
    promptKey: string
}

import { ChatState, ReduxChat, IReduxChatInput } from 'prague';

type RecipeBotData = ChatState<undefined, undefined, undefined, undefined, RecipeState>;

interface AppState {
    bot: RecipeBotData;
}

type RecipeBotInput = IReduxChatInput<AppState, RecipeBotData>;

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

import { doRule, Action, Queries, firstMatch, filter, Match } from 'prague';

const reply = (text: string): Action<IChatInput> => (input) => input.reply(text);

// Prompts

import { Prompt } from 'prague';

const prompt = new Prompt<RecipeBotInput>(
    (input) => input.data.userInConversation.promptKey,
    (input, promptKey) => input.store.dispatch<RecipeAction>({ type: 'Set_PromptKey', promptKey })
);

const cheeses = ['Cheddar', 'Wensleydale', 'Brie', 'Velveeta'];

prompt.text('Favorite_Color', "What is your favorite color?", (input, args) =>
    input.reply(args === "blue" ? "That is correct!" : "That is incorrect"));

prompt.choice('Favorite_Cheese', "What is your favorite cheese?", cheeses, (input, args) =>
    input.reply(args === "Velveeta" ? "Ima let you finish but FYI that is not really cheese." : "Interesting."));

prompt.confirm('Like_Cheese', "Do you like cheese?", (input, args) =>
    input.reply(args ? "That is correct." : "That is incorrect."));

// Intents

// Message actions

const chooseRecipe = (input: RecipeBotInput, args: REArgs) => {
    const name = args.groups[1];
    const recipe = recipeFromName(name);
    if (recipe) {
        input.store.dispatch<RecipeAction>({ type: 'Set_Recipe', recipe });

        return Observable.from([
            `Great, let's make ${name} which ${recipe.recipeYield.toLowerCase()}!`,
            "Here are the ingredients:",
            ... recipe.recipeIngredient,
            "Let me know when you're ready to go."
        ])
        .zip(Observable.timer(0, 1000), x => x) // Right now we're having trouble introducing delays
        .do(ingredient => input.reply(ingredient))
        .count();
    } else {
        return input.replyAsync(`Sorry, I don't know how to make ${name}. Maybe one day you can teach me.`);
    }
}

const queryQuantity: Action<RecipeBotInput> = (input, args: REArgs) => {
    const ingredientQuery = args.groups[1].split('');

    const ingredient = input.data.userInConversation.recipe.recipeIngredient
        .map<[string, number]>(i => [i, lcs(i.split(''), ingredientQuery).length])
        .reduce((prev, curr) => prev[1] > curr[1] ? prev : curr)
        [0];

    input.reply(ingredient);
}

const nextInstruction: Action<RecipeBotInput> = (input, args: REArgs) => {
    const nextInstruction = input.data.userInConversation.lastInstructionSent + 1;
    if (nextInstruction < input.data.userInConversation.recipe.recipeInstructions.length)
        sayInstruction(input, { instruction: nextInstruction });
    else
        input.reply("That's it!");
}

const previousInstruction: Action<RecipeBotInput> = (input, args: REArgs) => {
    const prevInstruction = input.data.userInConversation.lastInstructionSent - 1;
    if (prevInstruction >= 0)
        sayInstruction(input, { instruction: prevInstruction });
    else
        input.reply("We're at the beginning.");
}

const sayInstruction: Action<RecipeBotInput> = (input, args: { instruction: number }) => {
    input.reply(input.data.userInConversation.recipe.recipeInstructions[args.instruction]);
    if (input.data.userInConversation.recipe.recipeInstructions.length === args.instruction + 1)
        input.reply("That's it!");
    store.dispatch<RecipeAction>({ type: 'Set_Instruction', instruction: args.instruction });
}

// const globalDefaultRule = defaultRule(reply("I can't understand you. It's you, not me. Get it together and try again."));

const recipeFromName = (name: string) =>
    recipes.find(recipe => recipe.name.toLowerCase() === name.toLowerCase());

const queries: Queries<RecipeBotInput> = {
    noRecipe: (input) => !input.data.userInConversation.recipe,
    noInstructionsSent: (input) => input.data.userInConversation.lastInstructionSent === undefined,
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

const re = new RE<RecipeBotInput>();

// LUIS

import { LUIS, LuisEntity } from 'prague';

const luis = new LUIS<RecipeBotInput>('id', 'key', .5);

const recipeRule = firstMatch<RecipeBotInput>(

    // Prompts
    prompt.rule(),

    // For testing Prompts
    firstMatch(
        re.rule(intents.askQuestion, prompt.reply('Favorite_Color')),
        re.rule(intents.askYorNQuestion, prompt.reply('Like_Cheese')),
        re.rule(intents.askChoiceQuestion, prompt.reply('Favorite_Cheese'))
    ),

    // For testing LUIS

    luis.bestMatch(
        luis.intent('singASong', (input, args) => input.reply(`Let's sing ${luis.entityValue(args, 'song')}`)),
        luis.intent('findSomething', (input, args) => input.reply(`Okay let's find a ${luis.entityValue(args, 'what')} in ${luis.entityValue(args, 'where')}`))
    ),

    // If there is no recipe, we have to pick one
    filter(queries.noRecipe, firstMatch(
        re.rule(intents.chooseRecipe, chooseRecipe),
        re.rule([intents.queryQuantity, intents.instructions.start, intents.instructions.restart], reply("First please choose a recipe")),
        re.rule(intents.all, chooseRecipe)
    )),

    // Now that we have a recipe, these can happen at any time
    re.rule(intents.queryQuantity, queryQuantity), // TODO: conversions go here

    // If we haven't started listing instructions, wait for the user to tell us to start
    filter(queries.noInstructionsSent,
        re.rule([intents.instructions.start, intents.instructions.next], (input, args) => sayInstruction(input, { instruction: 0 }))
    ),

    // We are listing instructions. Let the user navigate among them.
    firstMatch(
        re.rule(intents.instructions.next, nextInstruction),
        re.rule(intents.instructions.repeat, (input, args) => sayInstruction(input, { instruction: input.data.userInConversation.lastInstructionSent })),
        re.rule(intents.instructions.previous, previousInstruction),
        re.rule(intents.instructions.restart, (input, args) => sayInstruction(input, { instruction: 0 })),
        // globalDefaultRule
    )
);

recipeBotChat.input$
.do(input => console.log("message", input.message))
.do(input => console.log("state before", input.state))
.flatMap(input =>
    doRule(input, recipeRule)
    .do(_ => console.log("state after", input.store.getState()))
)
.subscribe();
