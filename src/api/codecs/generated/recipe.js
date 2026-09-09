/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-mixed-operators, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
import $protobuf from "protobufjs/minimal.js";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
const $Object = $util.global.Object, $undefined = $util.global.undefined, $Error = $util.global.Error, $RangeError = $util.global.RangeError, $TypeError = $util.global.TypeError, $String = $util.global.String, $Number = $util.global.Number, $isFinite = $util.global.isFinite, $Array = $util.global.Array;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const Nutrient = $root.Nutrient = (() => {

    /**
     * Properties of a Nutrient.
     * @typedef {Object} Nutrient.$Properties
     * @property {string|null} [name] Nutrient name
     * @property {number|null} [amount] Nutrient amount
     * @property {string|null} [unit] Nutrient unit
     * @property {number|null} [percentOfDailyNeeds] Nutrient percentOfDailyNeeds
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */

    /**
     * Properties of a Nutrient.
     * @exports INutrient
     * @interface INutrient
     * @augments Nutrient.$Properties
     * @deprecated Use Nutrient.$Properties instead.
     */

    /**
     * Shape of a Nutrient.
     * @typedef {Nutrient.$Properties} Nutrient.$Shape
     */

    /**
     * Constructs a new Nutrient.
     * @exports Nutrient
     * @classdesc Represents a Nutrient.
     * @constructor
     * @param {Nutrient.$Properties=} [properties] Properties to set
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */
    const Nutrient = function (properties) {
        if (properties)
            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                    this[keys[i]] = properties[keys[i]];
    };

    /**
     * Nutrient name.
     * @member {string} name
     * @memberof Nutrient
     * @instance
     */
    Nutrient.prototype.name = "";

    /**
     * Nutrient amount.
     * @member {number} amount
     * @memberof Nutrient
     * @instance
     */
    Nutrient.prototype.amount = 0;

    /**
     * Nutrient unit.
     * @member {string} unit
     * @memberof Nutrient
     * @instance
     */
    Nutrient.prototype.unit = "";

    /**
     * Nutrient percentOfDailyNeeds.
     * @member {number} percentOfDailyNeeds
     * @memberof Nutrient
     * @instance
     */
    Nutrient.prototype.percentOfDailyNeeds = 0;

    /**
     * Creates a new Nutrient instance using the specified properties.
     * @function create
     * @memberof Nutrient
     * @static
     * @param {Nutrient.$Properties=} [properties] Properties to set
     * @returns {Nutrient} Nutrient instance
     * @type {{
     *   (properties: Nutrient.$Shape): Nutrient & Nutrient.$Shape;
     *   (properties?: Nutrient.$Properties): Nutrient;
     * }}
     */
    Nutrient.create = function(properties) {
        return new Nutrient(properties);
    };

    /**
     * Encodes the specified Nutrient message. Does not implicitly {@link Nutrient.verify|verify} messages.
     * @function encode
     * @memberof Nutrient
     * @static
     * @param {Nutrient.$Properties} message Nutrient message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Nutrient.encode = function (message, writer, _depth) {
        if (!writer)
            writer = $Writer.create();
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
        if (message.amount != null && $Object.hasOwnProperty.call(message, "amount") && !$Object.is(message.amount, 0))
            writer.uint32(/* id 2, wireType 1 =*/17).double(message.amount);
        if (message.unit != null && $Object.hasOwnProperty.call(message, "unit") && message.unit !== "")
            writer.uint32(/* id 3, wireType 2 =*/26).string(message.unit);
        if (message.percentOfDailyNeeds != null && $Object.hasOwnProperty.call(message, "percentOfDailyNeeds") && !$Object.is(message.percentOfDailyNeeds, 0))
            writer.uint32(/* id 4, wireType 1 =*/33).double(message.percentOfDailyNeeds);
        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
            for (let i = 0; i < message.$unknowns.length; ++i)
                writer.raw(message.$unknowns[i]);
        return writer;
    };

    /**
     * Encodes the specified Nutrient message, length delimited. Does not implicitly {@link Nutrient.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Nutrient
     * @static
     * @param {Nutrient.$Properties} message Nutrient message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Nutrient.encodeDelimited = function(message, writer) {
        return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
    };

    /**
     * Decodes a Nutrient message from the specified reader or buffer.
     * @function decode
     * @memberof Nutrient
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Nutrient & Nutrient.$Shape} Nutrient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Nutrient.decode = function (reader, length, _end, _depth, _target) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $Reader.recursionLimit)
            throw $Error("max depth exceeded");
        let end, message, value;
        if (length === $undefined)
            end = reader.len;
        else {
            end = reader.pos + length;
            if (end > reader.len)
                throw $RangeError("index out of range");
            length = reader.len;
            reader.len = end;
        }
        message = _target || new $root.Nutrient();
        while (reader.pos < end) {
            let start = reader.pos;
            let tag = reader.tag();
            if (tag === _end) {
                _end = $undefined;
                break;
            }
            let wireType = tag & 7;
            switch (tag >>>= 3) {
            case 1: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.name = value;
                    else
                        delete message.name;
                    continue;
                }
            case 2: {
                    if (wireType !== 1)
                        break;
                    if (!$Object.is(value = reader.double(), 0))
                        message.amount = value;
                    else
                        delete message.amount;
                    continue;
                }
            case 3: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.unit = value;
                    else
                        delete message.unit;
                    continue;
                }
            case 4: {
                    if (wireType !== 1)
                        break;
                    if (!$Object.is(value = reader.double(), 0))
                        message.percentOfDailyNeeds = value;
                    else
                        delete message.percentOfDailyNeeds;
                    continue;
                }
            }
            reader.skipType(wireType, _depth, tag);
            if (!reader.discardUnknown) {
                $util.makeProp(message, "$unknowns", false);
                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
            }
        }
        if (length !== $undefined) {
            if (reader.pos !== end)
                throw $RangeError("index out of range");
            reader.len = length;
        }
        if (_end !== $undefined)
            throw $Error("missing end group");
        return message;
    };

    /**
     * Decodes a Nutrient message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Nutrient
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Nutrient & Nutrient.$Shape} Nutrient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Nutrient.decodeDelimited = function(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a Nutrient message.
     * @function verify
     * @memberof Nutrient
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Nutrient.verify = function (message, _depth) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            return "max depth exceeded";
        if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
            if (!$util.isString(message.name))
                return "name: string expected";
        if (message.amount != null && $Object.hasOwnProperty.call(message, "amount"))
            if (typeof message.amount !== "number")
                return "amount: number expected";
        if (message.unit != null && $Object.hasOwnProperty.call(message, "unit"))
            if (!$util.isString(message.unit))
                return "unit: string expected";
        if (message.percentOfDailyNeeds != null && $Object.hasOwnProperty.call(message, "percentOfDailyNeeds"))
            if (typeof message.percentOfDailyNeeds !== "number")
                return "percentOfDailyNeeds: number expected";
        return null;
    };

    /**
     * Creates a Nutrient message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Nutrient
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Nutrient} Nutrient
     */
    Nutrient.fromObject = function (object, _depth) {
        if (object instanceof $root.Nutrient)
            return object;
        if (!$util.isObject(object))
            throw $TypeError(".Nutrient: object expected");
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let message = new $root.Nutrient();
        if (object.name != null)
            if (typeof object.name !== "string" || object.name.length)
                message.name = $String(object.name);
        if (object.amount != null)
            if (!$Object.is($Number(object.amount), 0))
                message.amount = $Number(object.amount);
        if (object.unit != null)
            if (typeof object.unit !== "string" || object.unit.length)
                message.unit = $String(object.unit);
        if (object.percentOfDailyNeeds != null)
            if (!$Object.is($Number(object.percentOfDailyNeeds), 0))
                message.percentOfDailyNeeds = $Number(object.percentOfDailyNeeds);
        return message;
    };

    /**
     * Creates a plain object from a Nutrient message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Nutrient
     * @static
     * @param {Nutrient} message Nutrient
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Nutrient.toObject = function (message, options, _depth) {
        if (!options)
            options = {};
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let object = {};
        if (options.defaults) {
            object.name = "";
            object.amount = 0;
            object.unit = "";
            object.percentOfDailyNeeds = 0;
        }
        if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
            object.name = message.name;
        if (message.amount != null && $Object.hasOwnProperty.call(message, "amount"))
            object.amount = options.json && !$isFinite(message.amount) ? $String(message.amount) : message.amount;
        if (message.unit != null && $Object.hasOwnProperty.call(message, "unit"))
            object.unit = message.unit;
        if (message.percentOfDailyNeeds != null && $Object.hasOwnProperty.call(message, "percentOfDailyNeeds"))
            object.percentOfDailyNeeds = options.json && !$isFinite(message.percentOfDailyNeeds) ? $String(message.percentOfDailyNeeds) : message.percentOfDailyNeeds;
        return object;
    };

    /**
     * Converts this Nutrient to JSON.
     * @function toJSON
     * @memberof Nutrient
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Nutrient.prototype.toJSON = function() {
        return Nutrient.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the type url for Nutrient
     * @function getTypeUrl
     * @memberof Nutrient
     * @static
     * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns {string} The type url
     */
    Nutrient.getTypeUrl = function(prefix) {
        if (prefix === $undefined)
            prefix = "type.googleapis.com";
        return prefix + "/Nutrient";
    };

    return Nutrient;
})();

export const NutritionInfo = $root.NutritionInfo = (() => {

    /**
     * Properties of a NutritionInfo.
     * @typedef {Object} NutritionInfo.$Properties
     * @property {Array.<Nutrient.$Properties>|null} [nutrients] NutritionInfo nutrients
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */

    /**
     * Properties of a NutritionInfo.
     * @exports INutritionInfo
     * @interface INutritionInfo
     * @augments NutritionInfo.$Properties
     * @deprecated Use NutritionInfo.$Properties instead.
     */

    /**
     * Shape of a NutritionInfo.
     * @typedef {NutritionInfo.$Properties} NutritionInfo.$Shape
     */

    /**
     * Constructs a new NutritionInfo.
     * @exports NutritionInfo
     * @classdesc Represents a NutritionInfo.
     * @constructor
     * @param {NutritionInfo.$Properties=} [properties] Properties to set
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */
    const NutritionInfo = function (properties) {
        this.nutrients = [];
        if (properties)
            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                    this[keys[i]] = properties[keys[i]];
    };

    /**
     * NutritionInfo nutrients.
     * @member {Array.<Nutrient.$Properties>} nutrients
     * @memberof NutritionInfo
     * @instance
     */
    NutritionInfo.prototype.nutrients = $util.emptyArray;

    /**
     * Creates a new NutritionInfo instance using the specified properties.
     * @function create
     * @memberof NutritionInfo
     * @static
     * @param {NutritionInfo.$Properties=} [properties] Properties to set
     * @returns {NutritionInfo} NutritionInfo instance
     * @type {{
     *   (properties: NutritionInfo.$Shape): NutritionInfo & NutritionInfo.$Shape;
     *   (properties?: NutritionInfo.$Properties): NutritionInfo;
     * }}
     */
    NutritionInfo.create = function(properties) {
        return new NutritionInfo(properties);
    };

    /**
     * Encodes the specified NutritionInfo message. Does not implicitly {@link NutritionInfo.verify|verify} messages.
     * @function encode
     * @memberof NutritionInfo
     * @static
     * @param {NutritionInfo.$Properties} message NutritionInfo message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    NutritionInfo.encode = function (message, writer, _depth) {
        if (!writer)
            writer = $Writer.create();
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        if (message.nutrients != null && message.nutrients.length)
            for (let i = 0; i < message.nutrients.length; ++i)
                $root.Nutrient.encode(message.nutrients[i], writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
            for (let i = 0; i < message.$unknowns.length; ++i)
                writer.raw(message.$unknowns[i]);
        return writer;
    };

    /**
     * Encodes the specified NutritionInfo message, length delimited. Does not implicitly {@link NutritionInfo.verify|verify} messages.
     * @function encodeDelimited
     * @memberof NutritionInfo
     * @static
     * @param {NutritionInfo.$Properties} message NutritionInfo message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    NutritionInfo.encodeDelimited = function(message, writer) {
        return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
    };

    /**
     * Decodes a NutritionInfo message from the specified reader or buffer.
     * @function decode
     * @memberof NutritionInfo
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {NutritionInfo & NutritionInfo.$Shape} NutritionInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    NutritionInfo.decode = function (reader, length, _end, _depth, _target) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $Reader.recursionLimit)
            throw $Error("max depth exceeded");
        let end, message;
        if (length === $undefined)
            end = reader.len;
        else {
            end = reader.pos + length;
            if (end > reader.len)
                throw $RangeError("index out of range");
            length = reader.len;
            reader.len = end;
        }
        message = _target || new $root.NutritionInfo();
        while (reader.pos < end) {
            let start = reader.pos;
            let tag = reader.tag();
            if (tag === _end) {
                _end = $undefined;
                break;
            }
            let wireType = tag & 7;
            switch (tag >>>= 3) {
            case 1: {
                    if (wireType !== 2)
                        break;
                    if (!(message.nutrients && message.nutrients.length))
                        message.nutrients = [];
                    message.nutrients.push($root.Nutrient.decode(reader, reader.uint32(), $undefined, _depth + 1));
                    continue;
                }
            }
            reader.skipType(wireType, _depth, tag);
            if (!reader.discardUnknown) {
                $util.makeProp(message, "$unknowns", false);
                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
            }
        }
        if (length !== $undefined) {
            if (reader.pos !== end)
                throw $RangeError("index out of range");
            reader.len = length;
        }
        if (_end !== $undefined)
            throw $Error("missing end group");
        return message;
    };

    /**
     * Decodes a NutritionInfo message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof NutritionInfo
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {NutritionInfo & NutritionInfo.$Shape} NutritionInfo
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    NutritionInfo.decodeDelimited = function(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a NutritionInfo message.
     * @function verify
     * @memberof NutritionInfo
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    NutritionInfo.verify = function (message, _depth) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            return "max depth exceeded";
        if (message.nutrients != null && $Object.hasOwnProperty.call(message, "nutrients")) {
            if (!$Array.isArray(message.nutrients))
                return "nutrients: array expected";
            for (let i = 0; i < message.nutrients.length; ++i) {
                let error = $root.Nutrient.verify(message.nutrients[i], _depth + 1);
                if (error)
                    return "nutrients." + error;
            }
        }
        return null;
    };

    /**
     * Creates a NutritionInfo message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof NutritionInfo
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {NutritionInfo} NutritionInfo
     */
    NutritionInfo.fromObject = function (object, _depth) {
        if (object instanceof $root.NutritionInfo)
            return object;
        if (!$util.isObject(object))
            throw $TypeError(".NutritionInfo: object expected");
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let message = new $root.NutritionInfo();
        if (object.nutrients) {
            if (!$Array.isArray(object.nutrients))
                throw $TypeError(".NutritionInfo.nutrients: array expected");
            message.nutrients = $Array(object.nutrients.length);
            for (let i = 0; i < object.nutrients.length; ++i) {
                if (!$util.isObject(object.nutrients[i]))
                    throw $TypeError(".NutritionInfo.nutrients: object expected");
                message.nutrients[i] = $root.Nutrient.fromObject(object.nutrients[i], _depth + 1);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from a NutritionInfo message. Also converts values to other types if specified.
     * @function toObject
     * @memberof NutritionInfo
     * @static
     * @param {NutritionInfo} message NutritionInfo
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    NutritionInfo.toObject = function (message, options, _depth) {
        if (!options)
            options = {};
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let object = {};
        if (options.arrays || options.defaults)
            object.nutrients = [];
        if (message.nutrients && message.nutrients.length) {
            object.nutrients = $Array(message.nutrients.length);
            for (let j = 0; j < message.nutrients.length; ++j)
                object.nutrients[j] = $root.Nutrient.toObject(message.nutrients[j], options, _depth + 1);
        }
        return object;
    };

    /**
     * Converts this NutritionInfo to JSON.
     * @function toJSON
     * @memberof NutritionInfo
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    NutritionInfo.prototype.toJSON = function() {
        return NutritionInfo.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the type url for NutritionInfo
     * @function getTypeUrl
     * @memberof NutritionInfo
     * @static
     * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns {string} The type url
     */
    NutritionInfo.getTypeUrl = function(prefix) {
        if (prefix === $undefined)
            prefix = "type.googleapis.com";
        return prefix + "/NutritionInfo";
    };

    return NutritionInfo;
})();

export const Ingredient = $root.Ingredient = (() => {

    /**
     * Properties of an Ingredient.
     * @typedef {Object} Ingredient.$Properties
     * @property {number|null} [id] Ingredient id
     * @property {number|null} [amount] Ingredient amount
     * @property {string|null} [unit] Ingredient unit
     * @property {string|null} [name] Ingredient name
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */

    /**
     * Properties of an Ingredient.
     * @exports IIngredient
     * @interface IIngredient
     * @augments Ingredient.$Properties
     * @deprecated Use Ingredient.$Properties instead.
     */

    /**
     * Shape of an Ingredient.
     * @typedef {Ingredient.$Properties} Ingredient.$Shape
     */

    /**
     * Constructs a new Ingredient.
     * @exports Ingredient
     * @classdesc Represents an Ingredient.
     * @constructor
     * @param {Ingredient.$Properties=} [properties] Properties to set
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */
    const Ingredient = function (properties) {
        if (properties)
            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                    this[keys[i]] = properties[keys[i]];
    };

    /**
     * Ingredient id.
     * @member {number} id
     * @memberof Ingredient
     * @instance
     */
    Ingredient.prototype.id = 0;

    /**
     * Ingredient amount.
     * @member {number} amount
     * @memberof Ingredient
     * @instance
     */
    Ingredient.prototype.amount = 0;

    /**
     * Ingredient unit.
     * @member {string} unit
     * @memberof Ingredient
     * @instance
     */
    Ingredient.prototype.unit = "";

    /**
     * Ingredient name.
     * @member {string} name
     * @memberof Ingredient
     * @instance
     */
    Ingredient.prototype.name = "";

    /**
     * Creates a new Ingredient instance using the specified properties.
     * @function create
     * @memberof Ingredient
     * @static
     * @param {Ingredient.$Properties=} [properties] Properties to set
     * @returns {Ingredient} Ingredient instance
     * @type {{
     *   (properties: Ingredient.$Shape): Ingredient & Ingredient.$Shape;
     *   (properties?: Ingredient.$Properties): Ingredient;
     * }}
     */
    Ingredient.create = function(properties) {
        return new Ingredient(properties);
    };

    /**
     * Encodes the specified Ingredient message. Does not implicitly {@link Ingredient.verify|verify} messages.
     * @function encode
     * @memberof Ingredient
     * @static
     * @param {Ingredient.$Properties} message Ingredient message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Ingredient.encode = function (message, writer, _depth) {
        if (!writer)
            writer = $Writer.create();
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== 0)
            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.id);
        if (message.amount != null && $Object.hasOwnProperty.call(message, "amount") && !$Object.is(message.amount, 0))
            writer.uint32(/* id 2, wireType 1 =*/17).double(message.amount);
        if (message.unit != null && $Object.hasOwnProperty.call(message, "unit") && message.unit !== "")
            writer.uint32(/* id 3, wireType 2 =*/26).string(message.unit);
        if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
            writer.uint32(/* id 4, wireType 2 =*/34).string(message.name);
        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
            for (let i = 0; i < message.$unknowns.length; ++i)
                writer.raw(message.$unknowns[i]);
        return writer;
    };

    /**
     * Encodes the specified Ingredient message, length delimited. Does not implicitly {@link Ingredient.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Ingredient
     * @static
     * @param {Ingredient.$Properties} message Ingredient message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Ingredient.encodeDelimited = function(message, writer) {
        return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
    };

    /**
     * Decodes an Ingredient message from the specified reader or buffer.
     * @function decode
     * @memberof Ingredient
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Ingredient & Ingredient.$Shape} Ingredient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Ingredient.decode = function (reader, length, _end, _depth, _target) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $Reader.recursionLimit)
            throw $Error("max depth exceeded");
        let end, message, value;
        if (length === $undefined)
            end = reader.len;
        else {
            end = reader.pos + length;
            if (end > reader.len)
                throw $RangeError("index out of range");
            length = reader.len;
            reader.len = end;
        }
        message = _target || new $root.Ingredient();
        while (reader.pos < end) {
            let start = reader.pos;
            let tag = reader.tag();
            if (tag === _end) {
                _end = $undefined;
                break;
            }
            let wireType = tag & 7;
            switch (tag >>>= 3) {
            case 1: {
                    if (wireType !== 0)
                        break;
                    if (value = reader.int32())
                        message.id = value;
                    else
                        delete message.id;
                    continue;
                }
            case 2: {
                    if (wireType !== 1)
                        break;
                    if (!$Object.is(value = reader.double(), 0))
                        message.amount = value;
                    else
                        delete message.amount;
                    continue;
                }
            case 3: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.unit = value;
                    else
                        delete message.unit;
                    continue;
                }
            case 4: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.name = value;
                    else
                        delete message.name;
                    continue;
                }
            }
            reader.skipType(wireType, _depth, tag);
            if (!reader.discardUnknown) {
                $util.makeProp(message, "$unknowns", false);
                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
            }
        }
        if (length !== $undefined) {
            if (reader.pos !== end)
                throw $RangeError("index out of range");
            reader.len = length;
        }
        if (_end !== $undefined)
            throw $Error("missing end group");
        return message;
    };

    /**
     * Decodes an Ingredient message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Ingredient
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Ingredient & Ingredient.$Shape} Ingredient
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Ingredient.decodeDelimited = function(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an Ingredient message.
     * @function verify
     * @memberof Ingredient
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Ingredient.verify = function (message, _depth) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            return "max depth exceeded";
        if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
            if (!$util.isInteger(message.id))
                return "id: integer expected";
        if (message.amount != null && $Object.hasOwnProperty.call(message, "amount"))
            if (typeof message.amount !== "number")
                return "amount: number expected";
        if (message.unit != null && $Object.hasOwnProperty.call(message, "unit"))
            if (!$util.isString(message.unit))
                return "unit: string expected";
        if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
            if (!$util.isString(message.name))
                return "name: string expected";
        return null;
    };

    /**
     * Creates an Ingredient message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Ingredient
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Ingredient} Ingredient
     */
    Ingredient.fromObject = function (object, _depth) {
        if (object instanceof $root.Ingredient)
            return object;
        if (!$util.isObject(object))
            throw $TypeError(".Ingredient: object expected");
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let message = new $root.Ingredient();
        if (object.id != null)
            if ($Number(object.id) !== 0)
                message.id = object.id | 0;
        if (object.amount != null)
            if (!$Object.is($Number(object.amount), 0))
                message.amount = $Number(object.amount);
        if (object.unit != null)
            if (typeof object.unit !== "string" || object.unit.length)
                message.unit = $String(object.unit);
        if (object.name != null)
            if (typeof object.name !== "string" || object.name.length)
                message.name = $String(object.name);
        return message;
    };

    /**
     * Creates a plain object from an Ingredient message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Ingredient
     * @static
     * @param {Ingredient} message Ingredient
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Ingredient.toObject = function (message, options, _depth) {
        if (!options)
            options = {};
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let object = {};
        if (options.defaults) {
            object.id = 0;
            object.amount = 0;
            object.unit = "";
            object.name = "";
        }
        if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
            object.id = message.id;
        if (message.amount != null && $Object.hasOwnProperty.call(message, "amount"))
            object.amount = options.json && !$isFinite(message.amount) ? $String(message.amount) : message.amount;
        if (message.unit != null && $Object.hasOwnProperty.call(message, "unit"))
            object.unit = message.unit;
        if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
            object.name = message.name;
        return object;
    };

    /**
     * Converts this Ingredient to JSON.
     * @function toJSON
     * @memberof Ingredient
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Ingredient.prototype.toJSON = function() {
        return Ingredient.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the type url for Ingredient
     * @function getTypeUrl
     * @memberof Ingredient
     * @static
     * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns {string} The type url
     */
    Ingredient.getTypeUrl = function(prefix) {
        if (prefix === $undefined)
            prefix = "type.googleapis.com";
        return prefix + "/Ingredient";
    };

    return Ingredient;
})();

export const Step = $root.Step = (() => {

    /**
     * Properties of a Step.
     * @typedef {Object} Step.$Properties
     * @property {number|null} [number] Step number
     * @property {string|null} [step] Step step
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */

    /**
     * Properties of a Step.
     * @exports IStep
     * @interface IStep
     * @augments Step.$Properties
     * @deprecated Use Step.$Properties instead.
     */

    /**
     * Shape of a Step.
     * @typedef {Step.$Properties} Step.$Shape
     */

    /**
     * Constructs a new Step.
     * @exports Step
     * @classdesc Represents a Step.
     * @constructor
     * @param {Step.$Properties=} [properties] Properties to set
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */
    const Step = function (properties) {
        if (properties)
            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                    this[keys[i]] = properties[keys[i]];
    };

    /**
     * Step number.
     * @member {number} number
     * @memberof Step
     * @instance
     */
    Step.prototype.number = 0;

    /**
     * Step step.
     * @member {string} step
     * @memberof Step
     * @instance
     */
    Step.prototype.step = "";

    /**
     * Creates a new Step instance using the specified properties.
     * @function create
     * @memberof Step
     * @static
     * @param {Step.$Properties=} [properties] Properties to set
     * @returns {Step} Step instance
     * @type {{
     *   (properties: Step.$Shape): Step & Step.$Shape;
     *   (properties?: Step.$Properties): Step;
     * }}
     */
    Step.create = function(properties) {
        return new Step(properties);
    };

    /**
     * Encodes the specified Step message. Does not implicitly {@link Step.verify|verify} messages.
     * @function encode
     * @memberof Step
     * @static
     * @param {Step.$Properties} message Step message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Step.encode = function (message, writer, _depth) {
        if (!writer)
            writer = $Writer.create();
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        if (message.number != null && $Object.hasOwnProperty.call(message, "number") && message.number !== 0)
            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.number);
        if (message.step != null && $Object.hasOwnProperty.call(message, "step") && message.step !== "")
            writer.uint32(/* id 2, wireType 2 =*/18).string(message.step);
        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
            for (let i = 0; i < message.$unknowns.length; ++i)
                writer.raw(message.$unknowns[i]);
        return writer;
    };

    /**
     * Encodes the specified Step message, length delimited. Does not implicitly {@link Step.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Step
     * @static
     * @param {Step.$Properties} message Step message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Step.encodeDelimited = function(message, writer) {
        return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
    };

    /**
     * Decodes a Step message from the specified reader or buffer.
     * @function decode
     * @memberof Step
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Step & Step.$Shape} Step
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Step.decode = function (reader, length, _end, _depth, _target) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $Reader.recursionLimit)
            throw $Error("max depth exceeded");
        let end, message, value;
        if (length === $undefined)
            end = reader.len;
        else {
            end = reader.pos + length;
            if (end > reader.len)
                throw $RangeError("index out of range");
            length = reader.len;
            reader.len = end;
        }
        message = _target || new $root.Step();
        while (reader.pos < end) {
            let start = reader.pos;
            let tag = reader.tag();
            if (tag === _end) {
                _end = $undefined;
                break;
            }
            let wireType = tag & 7;
            switch (tag >>>= 3) {
            case 1: {
                    if (wireType !== 0)
                        break;
                    if (value = reader.int32())
                        message.number = value;
                    else
                        delete message.number;
                    continue;
                }
            case 2: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.step = value;
                    else
                        delete message.step;
                    continue;
                }
            }
            reader.skipType(wireType, _depth, tag);
            if (!reader.discardUnknown) {
                $util.makeProp(message, "$unknowns", false);
                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
            }
        }
        if (length !== $undefined) {
            if (reader.pos !== end)
                throw $RangeError("index out of range");
            reader.len = length;
        }
        if (_end !== $undefined)
            throw $Error("missing end group");
        return message;
    };

    /**
     * Decodes a Step message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Step
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Step & Step.$Shape} Step
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Step.decodeDelimited = function(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a Step message.
     * @function verify
     * @memberof Step
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Step.verify = function (message, _depth) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            return "max depth exceeded";
        if (message.number != null && $Object.hasOwnProperty.call(message, "number"))
            if (!$util.isInteger(message.number))
                return "number: integer expected";
        if (message.step != null && $Object.hasOwnProperty.call(message, "step"))
            if (!$util.isString(message.step))
                return "step: string expected";
        return null;
    };

    /**
     * Creates a Step message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Step
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Step} Step
     */
    Step.fromObject = function (object, _depth) {
        if (object instanceof $root.Step)
            return object;
        if (!$util.isObject(object))
            throw $TypeError(".Step: object expected");
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let message = new $root.Step();
        if (object.number != null)
            if ($Number(object.number) !== 0)
                message.number = object.number | 0;
        if (object.step != null)
            if (typeof object.step !== "string" || object.step.length)
                message.step = $String(object.step);
        return message;
    };

    /**
     * Creates a plain object from a Step message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Step
     * @static
     * @param {Step} message Step
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Step.toObject = function (message, options, _depth) {
        if (!options)
            options = {};
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let object = {};
        if (options.defaults) {
            object.number = 0;
            object.step = "";
        }
        if (message.number != null && $Object.hasOwnProperty.call(message, "number"))
            object.number = message.number;
        if (message.step != null && $Object.hasOwnProperty.call(message, "step"))
            object.step = message.step;
        return object;
    };

    /**
     * Converts this Step to JSON.
     * @function toJSON
     * @memberof Step
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Step.prototype.toJSON = function() {
        return Step.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the type url for Step
     * @function getTypeUrl
     * @memberof Step
     * @static
     * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns {string} The type url
     */
    Step.getTypeUrl = function(prefix) {
        if (prefix === $undefined)
            prefix = "type.googleapis.com";
        return prefix + "/Step";
    };

    return Step;
})();

export const AnalyzedInstruction = $root.AnalyzedInstruction = (() => {

    /**
     * Properties of an AnalyzedInstruction.
     * @typedef {Object} AnalyzedInstruction.$Properties
     * @property {string|null} [name] AnalyzedInstruction name
     * @property {Array.<Step.$Properties>|null} [steps] AnalyzedInstruction steps
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */

    /**
     * Properties of an AnalyzedInstruction.
     * @exports IAnalyzedInstruction
     * @interface IAnalyzedInstruction
     * @augments AnalyzedInstruction.$Properties
     * @deprecated Use AnalyzedInstruction.$Properties instead.
     */

    /**
     * Shape of an AnalyzedInstruction.
     * @typedef {AnalyzedInstruction.$Properties} AnalyzedInstruction.$Shape
     */

    /**
     * Constructs a new AnalyzedInstruction.
     * @exports AnalyzedInstruction
     * @classdesc Represents an AnalyzedInstruction.
     * @constructor
     * @param {AnalyzedInstruction.$Properties=} [properties] Properties to set
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */
    const AnalyzedInstruction = function (properties) {
        this.steps = [];
        if (properties)
            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                    this[keys[i]] = properties[keys[i]];
    };

    /**
     * AnalyzedInstruction name.
     * @member {string} name
     * @memberof AnalyzedInstruction
     * @instance
     */
    AnalyzedInstruction.prototype.name = "";

    /**
     * AnalyzedInstruction steps.
     * @member {Array.<Step.$Properties>} steps
     * @memberof AnalyzedInstruction
     * @instance
     */
    AnalyzedInstruction.prototype.steps = $util.emptyArray;

    /**
     * Creates a new AnalyzedInstruction instance using the specified properties.
     * @function create
     * @memberof AnalyzedInstruction
     * @static
     * @param {AnalyzedInstruction.$Properties=} [properties] Properties to set
     * @returns {AnalyzedInstruction} AnalyzedInstruction instance
     * @type {{
     *   (properties: AnalyzedInstruction.$Shape): AnalyzedInstruction & AnalyzedInstruction.$Shape;
     *   (properties?: AnalyzedInstruction.$Properties): AnalyzedInstruction;
     * }}
     */
    AnalyzedInstruction.create = function(properties) {
        return new AnalyzedInstruction(properties);
    };

    /**
     * Encodes the specified AnalyzedInstruction message. Does not implicitly {@link AnalyzedInstruction.verify|verify} messages.
     * @function encode
     * @memberof AnalyzedInstruction
     * @static
     * @param {AnalyzedInstruction.$Properties} message AnalyzedInstruction message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    AnalyzedInstruction.encode = function (message, writer, _depth) {
        if (!writer)
            writer = $Writer.create();
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
        if (message.steps != null && message.steps.length)
            for (let i = 0; i < message.steps.length; ++i)
                $root.Step.encode(message.steps[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
            for (let i = 0; i < message.$unknowns.length; ++i)
                writer.raw(message.$unknowns[i]);
        return writer;
    };

    /**
     * Encodes the specified AnalyzedInstruction message, length delimited. Does not implicitly {@link AnalyzedInstruction.verify|verify} messages.
     * @function encodeDelimited
     * @memberof AnalyzedInstruction
     * @static
     * @param {AnalyzedInstruction.$Properties} message AnalyzedInstruction message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    AnalyzedInstruction.encodeDelimited = function(message, writer) {
        return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
    };

    /**
     * Decodes an AnalyzedInstruction message from the specified reader or buffer.
     * @function decode
     * @memberof AnalyzedInstruction
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {AnalyzedInstruction & AnalyzedInstruction.$Shape} AnalyzedInstruction
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    AnalyzedInstruction.decode = function (reader, length, _end, _depth, _target) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $Reader.recursionLimit)
            throw $Error("max depth exceeded");
        let end, message, value;
        if (length === $undefined)
            end = reader.len;
        else {
            end = reader.pos + length;
            if (end > reader.len)
                throw $RangeError("index out of range");
            length = reader.len;
            reader.len = end;
        }
        message = _target || new $root.AnalyzedInstruction();
        while (reader.pos < end) {
            let start = reader.pos;
            let tag = reader.tag();
            if (tag === _end) {
                _end = $undefined;
                break;
            }
            let wireType = tag & 7;
            switch (tag >>>= 3) {
            case 1: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.name = value;
                    else
                        delete message.name;
                    continue;
                }
            case 2: {
                    if (wireType !== 2)
                        break;
                    if (!(message.steps && message.steps.length))
                        message.steps = [];
                    message.steps.push($root.Step.decode(reader, reader.uint32(), $undefined, _depth + 1));
                    continue;
                }
            }
            reader.skipType(wireType, _depth, tag);
            if (!reader.discardUnknown) {
                $util.makeProp(message, "$unknowns", false);
                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
            }
        }
        if (length !== $undefined) {
            if (reader.pos !== end)
                throw $RangeError("index out of range");
            reader.len = length;
        }
        if (_end !== $undefined)
            throw $Error("missing end group");
        return message;
    };

    /**
     * Decodes an AnalyzedInstruction message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof AnalyzedInstruction
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {AnalyzedInstruction & AnalyzedInstruction.$Shape} AnalyzedInstruction
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    AnalyzedInstruction.decodeDelimited = function(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an AnalyzedInstruction message.
     * @function verify
     * @memberof AnalyzedInstruction
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    AnalyzedInstruction.verify = function (message, _depth) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            return "max depth exceeded";
        if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
            if (!$util.isString(message.name))
                return "name: string expected";
        if (message.steps != null && $Object.hasOwnProperty.call(message, "steps")) {
            if (!$Array.isArray(message.steps))
                return "steps: array expected";
            for (let i = 0; i < message.steps.length; ++i) {
                let error = $root.Step.verify(message.steps[i], _depth + 1);
                if (error)
                    return "steps." + error;
            }
        }
        return null;
    };

    /**
     * Creates an AnalyzedInstruction message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof AnalyzedInstruction
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {AnalyzedInstruction} AnalyzedInstruction
     */
    AnalyzedInstruction.fromObject = function (object, _depth) {
        if (object instanceof $root.AnalyzedInstruction)
            return object;
        if (!$util.isObject(object))
            throw $TypeError(".AnalyzedInstruction: object expected");
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let message = new $root.AnalyzedInstruction();
        if (object.name != null)
            if (typeof object.name !== "string" || object.name.length)
                message.name = $String(object.name);
        if (object.steps) {
            if (!$Array.isArray(object.steps))
                throw $TypeError(".AnalyzedInstruction.steps: array expected");
            message.steps = $Array(object.steps.length);
            for (let i = 0; i < object.steps.length; ++i) {
                if (!$util.isObject(object.steps[i]))
                    throw $TypeError(".AnalyzedInstruction.steps: object expected");
                message.steps[i] = $root.Step.fromObject(object.steps[i], _depth + 1);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from an AnalyzedInstruction message. Also converts values to other types if specified.
     * @function toObject
     * @memberof AnalyzedInstruction
     * @static
     * @param {AnalyzedInstruction} message AnalyzedInstruction
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    AnalyzedInstruction.toObject = function (message, options, _depth) {
        if (!options)
            options = {};
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let object = {};
        if (options.arrays || options.defaults)
            object.steps = [];
        if (options.defaults)
            object.name = "";
        if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
            object.name = message.name;
        if (message.steps && message.steps.length) {
            object.steps = $Array(message.steps.length);
            for (let j = 0; j < message.steps.length; ++j)
                object.steps[j] = $root.Step.toObject(message.steps[j], options, _depth + 1);
        }
        return object;
    };

    /**
     * Converts this AnalyzedInstruction to JSON.
     * @function toJSON
     * @memberof AnalyzedInstruction
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    AnalyzedInstruction.prototype.toJSON = function() {
        return AnalyzedInstruction.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the type url for AnalyzedInstruction
     * @function getTypeUrl
     * @memberof AnalyzedInstruction
     * @static
     * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns {string} The type url
     */
    AnalyzedInstruction.getTypeUrl = function(prefix) {
        if (prefix === $undefined)
            prefix = "type.googleapis.com";
        return prefix + "/AnalyzedInstruction";
    };

    return AnalyzedInstruction;
})();

export const Recipe = $root.Recipe = (() => {

    /**
     * Properties of a Recipe.
     * @typedef {Object} Recipe.$Properties
     * @property {number|null} [id] Recipe id
     * @property {string|null} [title] Recipe title
     * @property {string|null} [image] Recipe image
     * @property {number|null} [readyInMinutes] Recipe readyInMinutes
     * @property {number|null} [servings] Recipe servings
     * @property {string|null} [summary] Recipe summary
     * @property {NutritionInfo.$Properties|null} [nutrition] Recipe nutrition
     * @property {Array.<Ingredient.$Properties>|null} [extendedIngredients] Recipe extendedIngredients
     * @property {Array.<AnalyzedInstruction.$Properties>|null} [analyzedInstructions] Recipe analyzedInstructions
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */

    /**
     * Properties of a Recipe.
     * @exports IRecipe
     * @interface IRecipe
     * @augments Recipe.$Properties
     * @deprecated Use Recipe.$Properties instead.
     */

    /**
     * Shape of a Recipe.
     * @typedef {Recipe.$Properties} Recipe.$Shape
     */

    /**
     * Constructs a new Recipe.
     * @exports Recipe
     * @classdesc Represents a Recipe.
     * @constructor
     * @param {Recipe.$Properties=} [properties] Properties to set
     * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
     */
    const Recipe = function (properties) {
        this.extendedIngredients = [];
        this.analyzedInstructions = [];
        if (properties)
            for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null && keys[i] !== "__proto__")
                    this[keys[i]] = properties[keys[i]];
    };

    /**
     * Recipe id.
     * @member {number} id
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.id = 0;

    /**
     * Recipe title.
     * @member {string} title
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.title = "";

    /**
     * Recipe image.
     * @member {string} image
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.image = "";

    /**
     * Recipe readyInMinutes.
     * @member {number} readyInMinutes
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.readyInMinutes = 0;

    /**
     * Recipe servings.
     * @member {number} servings
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.servings = 0;

    /**
     * Recipe summary.
     * @member {string} summary
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.summary = "";

    /**
     * Recipe nutrition.
     * @member {NutritionInfo.$Properties|null|undefined} nutrition
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.nutrition = null;

    /**
     * Recipe extendedIngredients.
     * @member {Array.<Ingredient.$Properties>} extendedIngredients
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.extendedIngredients = $util.emptyArray;

    /**
     * Recipe analyzedInstructions.
     * @member {Array.<AnalyzedInstruction.$Properties>} analyzedInstructions
     * @memberof Recipe
     * @instance
     */
    Recipe.prototype.analyzedInstructions = $util.emptyArray;

    /**
     * Creates a new Recipe instance using the specified properties.
     * @function create
     * @memberof Recipe
     * @static
     * @param {Recipe.$Properties=} [properties] Properties to set
     * @returns {Recipe} Recipe instance
     * @type {{
     *   (properties: Recipe.$Shape): Recipe & Recipe.$Shape;
     *   (properties?: Recipe.$Properties): Recipe;
     * }}
     */
    Recipe.create = function(properties) {
        return new Recipe(properties);
    };

    /**
     * Encodes the specified Recipe message. Does not implicitly {@link Recipe.verify|verify} messages.
     * @function encode
     * @memberof Recipe
     * @static
     * @param {Recipe.$Properties} message Recipe message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Recipe.encode = function (message, writer, _depth) {
        if (!writer)
            writer = $Writer.create();
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        if (message.id != null && $Object.hasOwnProperty.call(message, "id") && message.id !== 0)
            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.id);
        if (message.title != null && $Object.hasOwnProperty.call(message, "title") && message.title !== "")
            writer.uint32(/* id 2, wireType 2 =*/18).string(message.title);
        if (message.image != null && $Object.hasOwnProperty.call(message, "image") && message.image !== "")
            writer.uint32(/* id 3, wireType 2 =*/26).string(message.image);
        if (message.readyInMinutes != null && $Object.hasOwnProperty.call(message, "readyInMinutes") && message.readyInMinutes !== 0)
            writer.uint32(/* id 4, wireType 0 =*/32).int32(message.readyInMinutes);
        if (message.servings != null && $Object.hasOwnProperty.call(message, "servings") && message.servings !== 0)
            writer.uint32(/* id 5, wireType 0 =*/40).int32(message.servings);
        if (message.summary != null && $Object.hasOwnProperty.call(message, "summary") && message.summary !== "")
            writer.uint32(/* id 6, wireType 2 =*/50).string(message.summary);
        if (message.nutrition != null && $Object.hasOwnProperty.call(message, "nutrition"))
            $root.NutritionInfo.encode(message.nutrition, writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
        if (message.extendedIngredients != null && message.extendedIngredients.length)
            for (let i = 0; i < message.extendedIngredients.length; ++i)
                $root.Ingredient.encode(message.extendedIngredients[i], writer.uint32(/* id 8, wireType 2 =*/66).fork(), _depth + 1).ldelim();
        if (message.analyzedInstructions != null && message.analyzedInstructions.length)
            for (let i = 0; i < message.analyzedInstructions.length; ++i)
                $root.AnalyzedInstruction.encode(message.analyzedInstructions[i], writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
        if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
            for (let i = 0; i < message.$unknowns.length; ++i)
                writer.raw(message.$unknowns[i]);
        return writer;
    };

    /**
     * Encodes the specified Recipe message, length delimited. Does not implicitly {@link Recipe.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Recipe
     * @static
     * @param {Recipe.$Properties} message Recipe message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Recipe.encodeDelimited = function(message, writer) {
        return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
    };

    /**
     * Decodes a Recipe message from the specified reader or buffer.
     * @function decode
     * @memberof Recipe
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Recipe & Recipe.$Shape} Recipe
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Recipe.decode = function (reader, length, _end, _depth, _target) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $Reader.recursionLimit)
            throw $Error("max depth exceeded");
        let end, message, value;
        if (length === $undefined)
            end = reader.len;
        else {
            end = reader.pos + length;
            if (end > reader.len)
                throw $RangeError("index out of range");
            length = reader.len;
            reader.len = end;
        }
        message = _target || new $root.Recipe();
        while (reader.pos < end) {
            let start = reader.pos;
            let tag = reader.tag();
            if (tag === _end) {
                _end = $undefined;
                break;
            }
            let wireType = tag & 7;
            switch (tag >>>= 3) {
            case 1: {
                    if (wireType !== 0)
                        break;
                    if (value = reader.int32())
                        message.id = value;
                    else
                        delete message.id;
                    continue;
                }
            case 2: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.title = value;
                    else
                        delete message.title;
                    continue;
                }
            case 3: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.image = value;
                    else
                        delete message.image;
                    continue;
                }
            case 4: {
                    if (wireType !== 0)
                        break;
                    if (value = reader.int32())
                        message.readyInMinutes = value;
                    else
                        delete message.readyInMinutes;
                    continue;
                }
            case 5: {
                    if (wireType !== 0)
                        break;
                    if (value = reader.int32())
                        message.servings = value;
                    else
                        delete message.servings;
                    continue;
                }
            case 6: {
                    if (wireType !== 2)
                        break;
                    if ((value = reader.stringVerify()).length)
                        message.summary = value;
                    else
                        delete message.summary;
                    continue;
                }
            case 7: {
                    if (wireType !== 2)
                        break;
                    message.nutrition = $root.NutritionInfo.decode(reader, reader.uint32(), $undefined, _depth + 1, message.nutrition);
                    continue;
                }
            case 8: {
                    if (wireType !== 2)
                        break;
                    if (!(message.extendedIngredients && message.extendedIngredients.length))
                        message.extendedIngredients = [];
                    message.extendedIngredients.push($root.Ingredient.decode(reader, reader.uint32(), $undefined, _depth + 1));
                    continue;
                }
            case 9: {
                    if (wireType !== 2)
                        break;
                    if (!(message.analyzedInstructions && message.analyzedInstructions.length))
                        message.analyzedInstructions = [];
                    message.analyzedInstructions.push($root.AnalyzedInstruction.decode(reader, reader.uint32(), $undefined, _depth + 1));
                    continue;
                }
            }
            reader.skipType(wireType, _depth, tag);
            if (!reader.discardUnknown) {
                $util.makeProp(message, "$unknowns", false);
                (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
            }
        }
        if (length !== $undefined) {
            if (reader.pos !== end)
                throw $RangeError("index out of range");
            reader.len = length;
        }
        if (_end !== $undefined)
            throw $Error("missing end group");
        return message;
    };

    /**
     * Decodes a Recipe message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Recipe
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Recipe & Recipe.$Shape} Recipe
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Recipe.decodeDelimited = function(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a Recipe message.
     * @function verify
     * @memberof Recipe
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Recipe.verify = function (message, _depth) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            return "max depth exceeded";
        if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
            if (!$util.isInteger(message.id))
                return "id: integer expected";
        if (message.title != null && $Object.hasOwnProperty.call(message, "title"))
            if (!$util.isString(message.title))
                return "title: string expected";
        if (message.image != null && $Object.hasOwnProperty.call(message, "image"))
            if (!$util.isString(message.image))
                return "image: string expected";
        if (message.readyInMinutes != null && $Object.hasOwnProperty.call(message, "readyInMinutes"))
            if (!$util.isInteger(message.readyInMinutes))
                return "readyInMinutes: integer expected";
        if (message.servings != null && $Object.hasOwnProperty.call(message, "servings"))
            if (!$util.isInteger(message.servings))
                return "servings: integer expected";
        if (message.summary != null && $Object.hasOwnProperty.call(message, "summary"))
            if (!$util.isString(message.summary))
                return "summary: string expected";
        if (message.nutrition != null && $Object.hasOwnProperty.call(message, "nutrition")) {
            let error = $root.NutritionInfo.verify(message.nutrition, _depth + 1);
            if (error)
                return "nutrition." + error;
        }
        if (message.extendedIngredients != null && $Object.hasOwnProperty.call(message, "extendedIngredients")) {
            if (!$Array.isArray(message.extendedIngredients))
                return "extendedIngredients: array expected";
            for (let i = 0; i < message.extendedIngredients.length; ++i) {
                let error = $root.Ingredient.verify(message.extendedIngredients[i], _depth + 1);
                if (error)
                    return "extendedIngredients." + error;
            }
        }
        if (message.analyzedInstructions != null && $Object.hasOwnProperty.call(message, "analyzedInstructions")) {
            if (!$Array.isArray(message.analyzedInstructions))
                return "analyzedInstructions: array expected";
            for (let i = 0; i < message.analyzedInstructions.length; ++i) {
                let error = $root.AnalyzedInstruction.verify(message.analyzedInstructions[i], _depth + 1);
                if (error)
                    return "analyzedInstructions." + error;
            }
        }
        return null;
    };

    /**
     * Creates a Recipe message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Recipe
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Recipe} Recipe
     */
    Recipe.fromObject = function (object, _depth) {
        if (object instanceof $root.Recipe)
            return object;
        if (!$util.isObject(object))
            throw $TypeError(".Recipe: object expected");
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let message = new $root.Recipe();
        if (object.id != null)
            if ($Number(object.id) !== 0)
                message.id = object.id | 0;
        if (object.title != null)
            if (typeof object.title !== "string" || object.title.length)
                message.title = $String(object.title);
        if (object.image != null)
            if (typeof object.image !== "string" || object.image.length)
                message.image = $String(object.image);
        if (object.readyInMinutes != null)
            if ($Number(object.readyInMinutes) !== 0)
                message.readyInMinutes = object.readyInMinutes | 0;
        if (object.servings != null)
            if ($Number(object.servings) !== 0)
                message.servings = object.servings | 0;
        if (object.summary != null)
            if (typeof object.summary !== "string" || object.summary.length)
                message.summary = $String(object.summary);
        if (object.nutrition != null) {
            if (!$util.isObject(object.nutrition))
                throw $TypeError(".Recipe.nutrition: object expected");
            message.nutrition = $root.NutritionInfo.fromObject(object.nutrition, _depth + 1);
        }
        if (object.extendedIngredients) {
            if (!$Array.isArray(object.extendedIngredients))
                throw $TypeError(".Recipe.extendedIngredients: array expected");
            message.extendedIngredients = $Array(object.extendedIngredients.length);
            for (let i = 0; i < object.extendedIngredients.length; ++i) {
                if (!$util.isObject(object.extendedIngredients[i]))
                    throw $TypeError(".Recipe.extendedIngredients: object expected");
                message.extendedIngredients[i] = $root.Ingredient.fromObject(object.extendedIngredients[i], _depth + 1);
            }
        }
        if (object.analyzedInstructions) {
            if (!$Array.isArray(object.analyzedInstructions))
                throw $TypeError(".Recipe.analyzedInstructions: array expected");
            message.analyzedInstructions = $Array(object.analyzedInstructions.length);
            for (let i = 0; i < object.analyzedInstructions.length; ++i) {
                if (!$util.isObject(object.analyzedInstructions[i]))
                    throw $TypeError(".Recipe.analyzedInstructions: object expected");
                message.analyzedInstructions[i] = $root.AnalyzedInstruction.fromObject(object.analyzedInstructions[i], _depth + 1);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from a Recipe message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Recipe
     * @static
     * @param {Recipe} message Recipe
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Recipe.toObject = function (message, options, _depth) {
        if (!options)
            options = {};
        if (_depth === $undefined)
            _depth = 0;
        if (_depth > $util.recursionLimit)
            throw $Error("max depth exceeded");
        let object = {};
        if (options.arrays || options.defaults) {
            object.extendedIngredients = [];
            object.analyzedInstructions = [];
        }
        if (options.defaults) {
            object.id = 0;
            object.title = "";
            object.image = "";
            object.readyInMinutes = 0;
            object.servings = 0;
            object.summary = "";
            object.nutrition = null;
        }
        if (message.id != null && $Object.hasOwnProperty.call(message, "id"))
            object.id = message.id;
        if (message.title != null && $Object.hasOwnProperty.call(message, "title"))
            object.title = message.title;
        if (message.image != null && $Object.hasOwnProperty.call(message, "image"))
            object.image = message.image;
        if (message.readyInMinutes != null && $Object.hasOwnProperty.call(message, "readyInMinutes"))
            object.readyInMinutes = message.readyInMinutes;
        if (message.servings != null && $Object.hasOwnProperty.call(message, "servings"))
            object.servings = message.servings;
        if (message.summary != null && $Object.hasOwnProperty.call(message, "summary"))
            object.summary = message.summary;
        if (message.nutrition != null && $Object.hasOwnProperty.call(message, "nutrition"))
            object.nutrition = $root.NutritionInfo.toObject(message.nutrition, options, _depth + 1);
        if (message.extendedIngredients && message.extendedIngredients.length) {
            object.extendedIngredients = $Array(message.extendedIngredients.length);
            for (let j = 0; j < message.extendedIngredients.length; ++j)
                object.extendedIngredients[j] = $root.Ingredient.toObject(message.extendedIngredients[j], options, _depth + 1);
        }
        if (message.analyzedInstructions && message.analyzedInstructions.length) {
            object.analyzedInstructions = $Array(message.analyzedInstructions.length);
            for (let j = 0; j < message.analyzedInstructions.length; ++j)
                object.analyzedInstructions[j] = $root.AnalyzedInstruction.toObject(message.analyzedInstructions[j], options, _depth + 1);
        }
        return object;
    };

    /**
     * Converts this Recipe to JSON.
     * @function toJSON
     * @memberof Recipe
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Recipe.prototype.toJSON = function() {
        return Recipe.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the type url for Recipe
     * @function getTypeUrl
     * @memberof Recipe
     * @static
     * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
     * @returns {string} The type url
     */
    Recipe.getTypeUrl = function(prefix) {
        if (prefix === $undefined)
            prefix = "type.googleapis.com";
        return prefix + "/Recipe";
    };

    return Recipe;
})();

export {
  $root as default
};
