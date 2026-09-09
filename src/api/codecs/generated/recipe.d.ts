import * as $protobuf from "protobufjs";
import Long = require("long");

/**
 * Properties of a Nutrient.
 * @deprecated Use Nutrient.$Properties instead.
 */
export interface INutrient extends Nutrient.$Properties {
}

/** Represents a Nutrient. */
export class Nutrient {

    /**
     * Constructs a new Nutrient.
     * @param [properties] Properties to set
     */
    constructor(properties?: Nutrient.$Properties);

    /** Unknown fields preserved while decoding when enabled */
    $unknowns?: Uint8Array[];

    /** Nutrient name. */
    name: string;

    /** Nutrient amount. */
    amount: number;

    /** Nutrient unit. */
    unit: string;

    /** Nutrient percentOfDailyNeeds. */
    percentOfDailyNeeds: number;

    /**
     * Creates a new Nutrient instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Nutrient instance
     */
    static create(properties: Nutrient.$Shape): Nutrient & Nutrient.$Shape;
    static create(properties?: Nutrient.$Properties): Nutrient;

    /**
     * Encodes the specified Nutrient message. Does not implicitly {@link Nutrient.verify|verify} messages.
     * @param message Nutrient message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encode(message: Nutrient.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Nutrient message, length delimited. Does not implicitly {@link Nutrient.verify|verify} messages.
     * @param message Nutrient message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encodeDelimited(message: Nutrient.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Nutrient message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns {Nutrient & Nutrient.$Shape} Nutrient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Nutrient & Nutrient.$Shape;

    /**
     * Decodes a Nutrient message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns {Nutrient & Nutrient.$Shape} Nutrient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Nutrient & Nutrient.$Shape;

    /**
     * Verifies a Nutrient message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a Nutrient message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Nutrient
     */
    static fromObject(object: { [k: string]: any }): Nutrient;

    /**
     * Creates a plain object from a Nutrient message. Also converts values to other types if specified.
     * @param message Nutrient
     * @param [options] Conversion options
     * @returns Plain object
     */
    static toObject(message: Nutrient, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Nutrient to JSON.
     * @returns JSON object
     */
    toJSON(): { [k: string]: any };

    /**
     * Gets the type url for Nutrient
     * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns The type url
     */
    static getTypeUrl(prefix?: string): string;
}

export namespace Nutrient {

    /** Properties of a Nutrient. */
    interface $Properties {

        /** Nutrient name */
        name?: (string|null);

        /** Nutrient amount */
        amount?: (number|null);

        /** Nutrient unit */
        unit?: (string|null);

        /** Nutrient percentOfDailyNeeds */
        percentOfDailyNeeds?: (number|null);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];
    }

    /** Shape of a Nutrient. */
    type $Shape = Nutrient.$Properties;
}

/**
 * Properties of a NutritionInfo.
 * @deprecated Use NutritionInfo.$Properties instead.
 */
export interface INutritionInfo extends NutritionInfo.$Properties {
}

/** Represents a NutritionInfo. */
export class NutritionInfo {

    /**
     * Constructs a new NutritionInfo.
     * @param [properties] Properties to set
     */
    constructor(properties?: NutritionInfo.$Properties);

    /** Unknown fields preserved while decoding when enabled */
    $unknowns?: Uint8Array[];

    /** NutritionInfo nutrients. */
    nutrients: Nutrient.$Properties[];

    /**
     * Creates a new NutritionInfo instance using the specified properties.
     * @param [properties] Properties to set
     * @returns NutritionInfo instance
     */
    static create(properties: NutritionInfo.$Shape): NutritionInfo & NutritionInfo.$Shape;
    static create(properties?: NutritionInfo.$Properties): NutritionInfo;

    /**
     * Encodes the specified NutritionInfo message. Does not implicitly {@link NutritionInfo.verify|verify} messages.
     * @param message NutritionInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encode(message: NutritionInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified NutritionInfo message, length delimited. Does not implicitly {@link NutritionInfo.verify|verify} messages.
     * @param message NutritionInfo message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encodeDelimited(message: NutritionInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a NutritionInfo message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns {NutritionInfo & NutritionInfo.$Shape} NutritionInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): NutritionInfo & NutritionInfo.$Shape;

    /**
     * Decodes a NutritionInfo message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns {NutritionInfo & NutritionInfo.$Shape} NutritionInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): NutritionInfo & NutritionInfo.$Shape;

    /**
     * Verifies a NutritionInfo message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a NutritionInfo message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns NutritionInfo
     */
    static fromObject(object: { [k: string]: any }): NutritionInfo;

    /**
     * Creates a plain object from a NutritionInfo message. Also converts values to other types if specified.
     * @param message NutritionInfo
     * @param [options] Conversion options
     * @returns Plain object
     */
    static toObject(message: NutritionInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this NutritionInfo to JSON.
     * @returns JSON object
     */
    toJSON(): { [k: string]: any };

    /**
     * Gets the type url for NutritionInfo
     * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns The type url
     */
    static getTypeUrl(prefix?: string): string;
}

export namespace NutritionInfo {

    /** Properties of a NutritionInfo. */
    interface $Properties {

        /** NutritionInfo nutrients */
        nutrients?: (Nutrient.$Properties[]|null);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];
    }

    /** Shape of a NutritionInfo. */
    type $Shape = NutritionInfo.$Properties;
}

/**
 * Properties of an Ingredient.
 * @deprecated Use Ingredient.$Properties instead.
 */
export interface IIngredient extends Ingredient.$Properties {
}

/** Represents an Ingredient. */
export class Ingredient {

    /**
     * Constructs a new Ingredient.
     * @param [properties] Properties to set
     */
    constructor(properties?: Ingredient.$Properties);

    /** Unknown fields preserved while decoding when enabled */
    $unknowns?: Uint8Array[];

    /** Ingredient id. */
    id: number;

    /** Ingredient amount. */
    amount: number;

    /** Ingredient unit. */
    unit: string;

    /** Ingredient name. */
    name: string;

    /**
     * Creates a new Ingredient instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Ingredient instance
     */
    static create(properties: Ingredient.$Shape): Ingredient & Ingredient.$Shape;
    static create(properties?: Ingredient.$Properties): Ingredient;

    /**
     * Encodes the specified Ingredient message. Does not implicitly {@link Ingredient.verify|verify} messages.
     * @param message Ingredient message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encode(message: Ingredient.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Ingredient message, length delimited. Does not implicitly {@link Ingredient.verify|verify} messages.
     * @param message Ingredient message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encodeDelimited(message: Ingredient.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an Ingredient message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns {Ingredient & Ingredient.$Shape} Ingredient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Ingredient & Ingredient.$Shape;

    /**
     * Decodes an Ingredient message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns {Ingredient & Ingredient.$Shape} Ingredient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Ingredient & Ingredient.$Shape;

    /**
     * Verifies an Ingredient message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an Ingredient message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Ingredient
     */
    static fromObject(object: { [k: string]: any }): Ingredient;

    /**
     * Creates a plain object from an Ingredient message. Also converts values to other types if specified.
     * @param message Ingredient
     * @param [options] Conversion options
     * @returns Plain object
     */
    static toObject(message: Ingredient, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Ingredient to JSON.
     * @returns JSON object
     */
    toJSON(): { [k: string]: any };

    /**
     * Gets the type url for Ingredient
     * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns The type url
     */
    static getTypeUrl(prefix?: string): string;
}

export namespace Ingredient {

    /** Properties of an Ingredient. */
    interface $Properties {

        /** Ingredient id */
        id?: (number|null);

        /** Ingredient amount */
        amount?: (number|null);

        /** Ingredient unit */
        unit?: (string|null);

        /** Ingredient name */
        name?: (string|null);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];
    }

    /** Shape of an Ingredient. */
    type $Shape = Ingredient.$Properties;
}

/**
 * Properties of a Step.
 * @deprecated Use Step.$Properties instead.
 */
export interface IStep extends Step.$Properties {
}

/** Represents a Step. */
export class Step {

    /**
     * Constructs a new Step.
     * @param [properties] Properties to set
     */
    constructor(properties?: Step.$Properties);

    /** Unknown fields preserved while decoding when enabled */
    $unknowns?: Uint8Array[];

    /** Step number. */
    number: number;

    /** Step step. */
    step: string;

    /**
     * Creates a new Step instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Step instance
     */
    static create(properties: Step.$Shape): Step & Step.$Shape;
    static create(properties?: Step.$Properties): Step;

    /**
     * Encodes the specified Step message. Does not implicitly {@link Step.verify|verify} messages.
     * @param message Step message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encode(message: Step.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Step message, length delimited. Does not implicitly {@link Step.verify|verify} messages.
     * @param message Step message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encodeDelimited(message: Step.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Step message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns {Step & Step.$Shape} Step
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Step & Step.$Shape;

    /**
     * Decodes a Step message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns {Step & Step.$Shape} Step
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Step & Step.$Shape;

    /**
     * Verifies a Step message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a Step message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Step
     */
    static fromObject(object: { [k: string]: any }): Step;

    /**
     * Creates a plain object from a Step message. Also converts values to other types if specified.
     * @param message Step
     * @param [options] Conversion options
     * @returns Plain object
     */
    static toObject(message: Step, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Step to JSON.
     * @returns JSON object
     */
    toJSON(): { [k: string]: any };

    /**
     * Gets the type url for Step
     * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns The type url
     */
    static getTypeUrl(prefix?: string): string;
}

export namespace Step {

    /** Properties of a Step. */
    interface $Properties {

        /** Step number */
        number?: (number|null);

        /** Step step */
        step?: (string|null);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];
    }

    /** Shape of a Step. */
    type $Shape = Step.$Properties;
}

/**
 * Properties of an AnalyzedInstruction.
 * @deprecated Use AnalyzedInstruction.$Properties instead.
 */
export interface IAnalyzedInstruction extends AnalyzedInstruction.$Properties {
}

/** Represents an AnalyzedInstruction. */
export class AnalyzedInstruction {

    /**
     * Constructs a new AnalyzedInstruction.
     * @param [properties] Properties to set
     */
    constructor(properties?: AnalyzedInstruction.$Properties);

    /** Unknown fields preserved while decoding when enabled */
    $unknowns?: Uint8Array[];

    /** AnalyzedInstruction name. */
    name: string;

    /** AnalyzedInstruction steps. */
    steps: Step.$Properties[];

    /**
     * Creates a new AnalyzedInstruction instance using the specified properties.
     * @param [properties] Properties to set
     * @returns AnalyzedInstruction instance
     */
    static create(properties: AnalyzedInstruction.$Shape): AnalyzedInstruction & AnalyzedInstruction.$Shape;
    static create(properties?: AnalyzedInstruction.$Properties): AnalyzedInstruction;

    /**
     * Encodes the specified AnalyzedInstruction message. Does not implicitly {@link AnalyzedInstruction.verify|verify} messages.
     * @param message AnalyzedInstruction message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encode(message: AnalyzedInstruction.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified AnalyzedInstruction message, length delimited. Does not implicitly {@link AnalyzedInstruction.verify|verify} messages.
     * @param message AnalyzedInstruction message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encodeDelimited(message: AnalyzedInstruction.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an AnalyzedInstruction message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns {AnalyzedInstruction & AnalyzedInstruction.$Shape} AnalyzedInstruction
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): AnalyzedInstruction & AnalyzedInstruction.$Shape;

    /**
     * Decodes an AnalyzedInstruction message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns {AnalyzedInstruction & AnalyzedInstruction.$Shape} AnalyzedInstruction
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): AnalyzedInstruction & AnalyzedInstruction.$Shape;

    /**
     * Verifies an AnalyzedInstruction message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an AnalyzedInstruction message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns AnalyzedInstruction
     */
    static fromObject(object: { [k: string]: any }): AnalyzedInstruction;

    /**
     * Creates a plain object from an AnalyzedInstruction message. Also converts values to other types if specified.
     * @param message AnalyzedInstruction
     * @param [options] Conversion options
     * @returns Plain object
     */
    static toObject(message: AnalyzedInstruction, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this AnalyzedInstruction to JSON.
     * @returns JSON object
     */
    toJSON(): { [k: string]: any };

    /**
     * Gets the type url for AnalyzedInstruction
     * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns The type url
     */
    static getTypeUrl(prefix?: string): string;
}

export namespace AnalyzedInstruction {

    /** Properties of an AnalyzedInstruction. */
    interface $Properties {

        /** AnalyzedInstruction name */
        name?: (string|null);

        /** AnalyzedInstruction steps */
        steps?: (Step.$Properties[]|null);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];
    }

    /** Shape of an AnalyzedInstruction. */
    type $Shape = AnalyzedInstruction.$Properties;
}

/**
 * Properties of a Recipe.
 * @deprecated Use Recipe.$Properties instead.
 */
export interface IRecipe extends Recipe.$Properties {
}

/** Represents a Recipe. */
export class Recipe {

    /**
     * Constructs a new Recipe.
     * @param [properties] Properties to set
     */
    constructor(properties?: Recipe.$Properties);

    /** Unknown fields preserved while decoding when enabled */
    $unknowns?: Uint8Array[];

    /** Recipe id. */
    id: number;

    /** Recipe title. */
    title: string;

    /** Recipe image. */
    image: string;

    /** Recipe readyInMinutes. */
    readyInMinutes: number;

    /** Recipe servings. */
    servings: number;

    /** Recipe summary. */
    summary: string;

    /** Recipe nutrition. */
    nutrition?: (NutritionInfo.$Properties|null);

    /** Recipe extendedIngredients. */
    extendedIngredients: Ingredient.$Properties[];

    /** Recipe analyzedInstructions. */
    analyzedInstructions: AnalyzedInstruction.$Properties[];

    /**
     * Creates a new Recipe instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Recipe instance
     */
    static create(properties: Recipe.$Shape): Recipe & Recipe.$Shape;
    static create(properties?: Recipe.$Properties): Recipe;

    /**
     * Encodes the specified Recipe message. Does not implicitly {@link Recipe.verify|verify} messages.
     * @param message Recipe message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encode(message: Recipe.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Recipe message, length delimited. Does not implicitly {@link Recipe.verify|verify} messages.
     * @param message Recipe message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    static encodeDelimited(message: Recipe.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Recipe message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns {Recipe & Recipe.$Shape} Recipe
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Recipe & Recipe.$Shape;

    /**
     * Decodes a Recipe message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns {Recipe & Recipe.$Shape} Recipe
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Recipe & Recipe.$Shape;

    /**
     * Verifies a Recipe message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a Recipe message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Recipe
     */
    static fromObject(object: { [k: string]: any }): Recipe;

    /**
     * Creates a plain object from a Recipe message. Also converts values to other types if specified.
     * @param message Recipe
     * @param [options] Conversion options
     * @returns Plain object
     */
    static toObject(message: Recipe, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Recipe to JSON.
     * @returns JSON object
     */
    toJSON(): { [k: string]: any };

    /**
     * Gets the type url for Recipe
     * @param [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns The type url
     */
    static getTypeUrl(prefix?: string): string;
}

export namespace Recipe {

    /** Properties of a Recipe. */
    interface $Properties {

        /** Recipe id */
        id?: (number|null);

        /** Recipe title */
        title?: (string|null);

        /** Recipe image */
        image?: (string|null);

        /** Recipe readyInMinutes */
        readyInMinutes?: (number|null);

        /** Recipe servings */
        servings?: (number|null);

        /** Recipe summary */
        summary?: (string|null);

        /** Recipe nutrition */
        nutrition?: (NutritionInfo.$Properties|null);

        /** Recipe extendedIngredients */
        extendedIngredients?: (Ingredient.$Properties[]|null);

        /** Recipe analyzedInstructions */
        analyzedInstructions?: (AnalyzedInstruction.$Properties[]|null);

        /** Unknown fields preserved while decoding when enabled */
        $unknowns?: Uint8Array[];
    }

    /** Shape of a Recipe. */
    type $Shape = Recipe.$Properties;
}
