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
import { UniversalChat, WebChatConnector, RegExpHelpers, IRegExpMatch } from 'prague';

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

import { ChatState, ReduxChat, IReduxMatch, IChatMessageMatch } from 'prague';

type RecipeBotData = ChatState<undefined, undefined, undefined, undefined, RecipeState>;

interface AppState {
    bot: RecipeBotData;
}

type RecipeBotMatch = IReduxMatch<AppState, RecipeBotData> & IChatMessageMatch;

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

import { Handler, Match, Predicate, Predicates, reply, Helpers } from 'prague';

const { first, filter, rule } = Helpers<RecipeBotMatch>();

// Prompts

import { TextPrompts, createChoice, createConfirm } from 'prague';

const prompts = new TextPrompts<RecipeBotMatch>(
    (match) => match.data.userInConversation.promptKey,
    (match, promptKey) => match.store.dispatch<RecipeAction>({ type: 'Set_PromptKey', promptKey })
);

const cheeses = ['Cheddar', 'Wensleydale', 'Brie', 'Velveeta'];

prompts.add('Favorite_Color', rule(match =>
    match.reply(match.text === "blue" ? "That is correct!" : "That is incorrect")
));

prompts.add('Favorite_Cheese', prompts.choice(cheeses, match =>
    match.reply(match.choice ===  "Velveeta" ? "Ima let you finish but FYI that is not really cheese." : "Interesting.")
));

prompts.add('Like_Cheese', prompts.confirm(match =>
    match.reply(match.confirm ? "That is correct." : "That is incorrect.")
));

// Intents

// Message actions

const chooseRecipe: Handler<RecipeBotMatch & IRegExpMatch> = (match) => {
    const name = match.groups[1];
    const recipe = recipeFromName(name);
    if (recipe) {
        match.store.dispatch<RecipeAction>({ type: 'Set_Recipe', recipe });

        return Observable.from([
            `Great, let's make ${name} which ${recipe.recipeYield.toLowerCase()}!`,
            "Here are the ingredients:",
            ... recipe.recipeIngredient,
            "Let me know when you're ready to go."
        ])
        .zip(Observable.timer(0, 1000), x => x) // Right now we're having trouble introducing delays
        .do(ingredient => match.reply(ingredient))
        .count();
    } else {
        return match.replyAsync(`Sorry, I don't know how to make ${name}. Maybe one day you can teach me.`);
    }
}

const queryQuantity: Handler<RecipeBotMatch & IRegExpMatch> = (match) => {
    const ingredientQuery = match.groups[1].split('');

    const ingredient = match.data.userInConversation.recipe.recipeIngredient
        .map<[string, number]>(i => [i, lcs(i.split(''), ingredientQuery).length])
        .reduce((prev, curr) => prev[1] > curr[1] ? prev : curr)
        [0];

    match.reply(ingredient);
}

const nextInstruction: Handler<RecipeBotMatch & IRegExpMatch> = (match) => {
    const nextInstruction = match.data.userInConversation.lastInstructionSent + 1;
    if (nextInstruction < match.data.userInConversation.recipe.recipeInstructions.length)
        sayInstruction({
            ... match,
            instruction: nextInstruction
        });
    else
        match.reply("That's it!");
}

const previousInstruction: Handler<RecipeBotMatch & IRegExpMatch> = (match) => {
    const prevInstruction = match.data.userInConversation.lastInstructionSent - 1;
    if (prevInstruction >= 0)
        sayInstruction({
            ... match,
            instruction: prevInstruction 
        });
    else
        match.reply("We're at the beginning.");
}

const sayInstruction: Handler<RecipeBotMatch & { instruction: number }> = (match) => {
    match.reply(match.data.userInConversation.recipe.recipeInstructions[match.instruction]);
    if (match.data.userInConversation.recipe.recipeInstructions.length === match.instruction + 1)
        match.reply("That's it!");
    store.dispatch<RecipeAction>({ type: 'Set_Instruction', instruction: match.instruction });
}

// const globalDefaultRule = defaultRule(reply("I can't understand you. It's you, not me. Get it together and try again."));

const recipeFromName = (name: string) =>
    recipes.find(recipe => recipe.name.toLowerCase() === name.toLowerCase());

const filters: Predicates<RecipeBotMatch> = {
    noRecipe: (match) => !match.data.userInConversation.recipe,
    noInstructionsSent: (match) => match.data.userInConversation.lastInstructionSent === undefined,
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

const { re } = RegExpHelpers<RecipeBotMatch>();

// LUIS

import { LuisModel, LuisEntity } from 'prague';

const luis = new LuisModel<RecipeBotMatch>('id', 'key', .5);

const recipeRule = first(

    // Prompts
    prompts,

    // For testing Prompts
    first(
        re(intents.askQuestion, match => {
            prompts.setPrompt(match, 'Favorite_Color');
            match.reply("What is your favorite color?");
        }),
        re(intents.askYorNQuestion, match => {
            prompts.setPrompt(match, 'Like_Cheese');
            match.reply(createConfirm("Do you like cheese?"));
        }),
        re(intents.askChoiceQuestion, match => {
            prompts.setPrompt(match, 'Favorite_Cheese');
            match.reply(createChoice("What is your favorite cheese?", cheeses));
        })
    ),

    // For testing LUIS

    luis.best(
        luis.rule('singASong', (match) => match.reply(`Let's sing ${match.entityValues('song')[0]}`)),
        luis.rule('findSomething', (match) => match.reply(`Okay let's find a ${match.entityValues('what')[0]} in ${match.entityValues('where')[0]}`))
    ),

    // If there is no recipe, we have to pick one
    filter(filters.noRecipe, first(
        re(intents.chooseRecipe, chooseRecipe),
        re([intents.queryQuantity, intents.instructions.start, intents.instructions.restart], reply("First please choose a recipe")),
        re(intents.all, chooseRecipe)
    )),

    // Now that we have a recipe, these can happen at any time
    re(intents.queryQuantity, queryQuantity), // TODO: conversions go here

    // If we haven't started listing instructions, wait for the user to tell us to start
    filter(filters.noInstructionsSent,
        re([intents.instructions.start, intents.instructions.next], (match) => sayInstruction({ ... match, instruction: 0 }))
    ),

    // We are listing instructions. Let the user navigate among them.
    first(
        re(intents.instructions.next, nextInstruction),
        re(intents.instructions.repeat, (match) => sayInstruction({ ... match, instruction: match.data.userInConversation.lastInstructionSent })),
        re(intents.instructions.previous, previousInstruction),
        re(intents.instructions.restart, (match) => sayInstruction({ ... match, instruction: 0 })),
        // globalDefaultRule
    )
);

recipeBotChat.run({
    message: recipeRule
});
