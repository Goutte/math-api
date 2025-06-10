const svg2png = require('svg2png');

/** @typedef {{ input: 'latex', inline?: boolean } | { input: 'mathml' }} InputDefinition */
/** @typedef {{ output: 'mathml' | 'svg' } | { output: 'png', width?: number, height?: number }} OutputDefinition */
/** @typedef {InputDefinition & OutputDefinition & { source: string } & { foreground?: string } & { background?: string } & { foreground_alpha?: int } & { background_alpha?: int }} Input */
/** @typedef {'mathml' | 'png' | 'svg'} OutputType */
/** @typedef {'application/mathml+xml' | 'image/png' | 'image/svg+xml'} ContentType */
/** @typedef {{ contentType: ContentType, isBase64Encoded?: boolean, data: string }} Output */

/** @typedef {{ httpMethod: 'GET' | 'POST', headers: { [x: string]: string }, queryStringParameters: { [x: string]: string }, body: string }} ApiGatewayProxyEvent */
/** @typedef {{ statusCode: number, headers?: { [x: string]: string }, body?: string | Buffer, isBase64Encoded?: boolean }} ApiGatewayProxyResponse */

/**
 * Response types.
 *
 * @var {{ [x: OutputType]: ContentType }}
 */
const RESPONSE_TYPES = {
    mathml: 'application/mathml+xml',
    png: 'image/png',
    svg: 'image/svg+xml',
};

const COLOR_REGEX_NOHASH = RegExp("^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$");
const COLOR_REGEX_3 = RegExp("^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$");
const COLOR_REGEX_6 = RegExp("^#[0-9a-fA-F]{6}$");
const COLOR_REGEX_8 = RegExp("^#[0-9a-fA-F]{8}$");

/**
 * MathJax settings.
 *
 * @var {{}}
 */
const defaultConfiguration = {
    loader: {
        paths: { mathjax: 'mathjax/es5' },
        require: require,
        load: [
            // https://docs.mathjax.org/en/latest/web/components/misc.html#adaptors-litedom
            'adaptors/liteDOM',
            // https://docs.mathjax.org/en/latest/web/components/input.html#input-tex-full
            'input/tex-full',
            // https://docs.mathjax.org/en/latest/web/components/input.html#input-mml
            'input/mml',
            // https://docs.mathjax.org/en/latest/web/components/input.html#input-asciimath
            'input/asciimath',
            // https://docs.mathjax.org/en/latest/web/components/output.html#output-chtml
            'output/chtml',
            // https://docs.mathjax.org/en/latest/web/components/output.html#output-svg
            'output/svg',
            // https://docs.mathjax.org/en/latest/web/components/accessibility.html#a11y-semantic-enrich
            //'a11y/semantic-enrich', //  Cannot find module 'speech-rule-engine'
            // https://docs.mathjax.org/en/latest/web/components/accessibility.html#a11y-assistive-mml
            //'a11y/assistive-mml', // XML Parsing Error: junk after document element

            '[tex]/ams',
            '[tex]/amscd',
            '[tex]/bbox',
            '[tex]/boldsymbol',
            '[tex]/braket',
            '[tex]/bussproofs',
            '[tex]/cancel',
            '[tex]/cases',
            '[tex]/centernot',
            '[tex]/color',
            '[tex]/configmacros',
            '[tex]/empheq',
            '[tex]/enclose',
            '[tex]/extpfeil',
            '[tex]/gensymb',
            '[tex]/mathtools',
            '[tex]/mhchem',
            '[tex]/newcommand',
            '[tex]/physics',
            '[tex]/setoptions',
            '[tex]/tagformat',
            '[tex]/textmacros',
            '[tex]/textcomp',
            '[tex]/unicode',
            '[tex]/upgreek',
            '[tex]/verb',
        ]
    },
    options: {
        enableAssistiveMml: false,
    },
    tex: {
        packages: {
            '[+]': [
                'ams',
                'amscd',
                'bbox',
                'boldsymbol',
                'braket',
                'bussproofs',
                'cancel',
                'cases',
                'centernot',
                'color',
                'configmacros',
                'empheq',
                'enclose',
                'extpfeil',
                'gensymb',
                'mathtools',
                'mhchem',
                'newcommand',
                'physics',
                'setoptions',
                'tagformat',
                'textmacros',
                'unicode',
                'upgreek',
                'verb',
            ],
        },
        color: {
            // padding: '5px',
        },
    },
    textmacros: {packages: {'[+]': ['textcomp']}},
};

const MJAX_SETTINGS = process.env.MJAX_SETTINGS ? JSON.parse(process.env.MJAX_SETTINGS) : defaultConfiguration;
MathJax = MJAX_SETTINGS;

require('mathjax/es5/tex-mml-svg.js');


/**
 * Detect format.
 *
 * @param {InputDefinition} input Input.
 * @returns {'TeX' | 'inline-TeX' | 'MathML'}
 */
const getFormat = (input) => {
    switch (input.input) {
        case 'mathml':
            return 'MathML';

        case 'latex':
            if (input.inline) {
                return 'inline-TeX';
            }

            return 'TeX';

        default:
            throw new Error(`Invalid input: ${input.input || ''}`);
    }
};

/**
 * Inject a style in the SVG.  Quick and Dirty.
 *
 * @param { string } data
 * @param { string } selector
 * @param { string } property
 * @param { string? } value
 * @returns { string }
 */
const addStyleToSvg = (data, selector, property, value) => {
    if (typeof value === 'undefined') { return data; }
    return data.replace(
        '<defs>',
        `<style>${selector} { ${property}: ${value}; }</style><defs>`
    );
};

/**
 * Hashes are annoying to pass by hand in URL queries, so we've made them optional.
 * Additionally, HTML color names like `chartreuse` should be supported as well.
 *
 * @param { ?string } color
 * @returns { ?string }
 */
const prependHashPerhaps = (color) => {
    if (typeof color !== 'undefined' && null !== color.match(COLOR_REGEX_NOHASH)) {
        return '#' + color;
    }
    return color;
};

/**
 * Convert decimal integer or string to 2-character hex form.
 *
 * @param { int | string } d
 * @returns { string } in the range 00 — FF
 */
const toHex2 = (d) => {
    return  ("0"+((Number(d)+0x100).toString(16))).slice(-2).toUpperCase();
};

/**
 * Combine color and alpha channels to make a CSS-compatible color value.
 * In case of named color values, the alpha channel is ignored.
 *
 * @param { ?string } color
 * @param { ?int } alpha
 * @returns { ?string }
 */
const makeCssColor = (color, alpha) => {
    if (typeof color === 'undefined') {
        if (typeof alpha !== 'undefined') {
            return '#000000' + toHex2(alpha);
        }
        return undefined;
    }

    const colorMatch3 = color.match(COLOR_REGEX_3);
    if (null !== colorMatch3) {
        if (typeof alpha !== 'undefined') {
            return '#'
                + colorMatch3[1] + colorMatch3[1]
                + colorMatch3[2] + colorMatch3[2]
                + colorMatch3[3] + colorMatch3[3]
                + toHex2(alpha);
        }
        return color;
    }

    const colorMatch6 = color.match(COLOR_REGEX_6);
    if (null !== colorMatch6) {
        if (typeof alpha !== 'undefined') {
            return color + toHex2(alpha);
        }
        return color;
    }

    const colorMatch8 = color.match(COLOR_REGEX_8);
    if (null !== colorMatch8) {
        if (typeof alpha !== 'undefined') {
            return color.slice(0, 7) + toHex2(alpha);
        }
        return color;
    }

    return color;
};

/**
 * Typeset math.
 *
 * @param {{ math: string, format: 'TeX' | 'inline-TeX' | 'MathML', mml?: boolean, svg?: boolean }} data Data.
 * @returns {Promise<{ mml?: string, svg?: string }>}
 */
const typeset = async (data) => {
    try {
        await MathJax.startup.promise;
        switch (data.format) {
            case 'TeX':
            case 'inline-TeX':
                if (data.mml) {
                    return MathJax.tex2mmlPromise(data.math);
                }
                if (data.svg) {
                    return MathJax.tex2svgPromise(data.math);
                }
                throw new Error(`Supported output formats for ${data.format} input are: MathML, SVG`);
            case 'MathML':
                if (data.svg) {
                    return MathJax.mathml2svgPromise(data.math);
                }
                throw new Error(`Supported output formats for ${data.format} input are: SVG`);
            default:
                throw new Error(`Unsupported input format: ${data.format}`);
        }
    } catch (err) {
        console.error('MathJax error', err);

        if (err instanceof Error) {
            throw err;
        }
        if (typeof err === 'string') {
            throw new Error(`MathJax error: ${err}`);
        }

        // Syntax error.
        if (Array.isArray(err) && typeof err[0] === 'string') {
            throw new SyntaxError(`Invalid source: ${err[0].replace(/[\n\r]+/g, ' ')}`);
        }
        throw new SyntaxError('Invalid source');
    }
};

/**
 * @param {{ mml?: string, svg?: string }} res
 * @param { ?string } fgColor
 * @param { ?string } bgColor
 * @returns { string }
 */
const makeInnerSvg = (res, fgColor, bgColor) => {
    let svg = MathJax.startup.adaptor.innerHTML(res);
    if (typeof fgColor !== 'undefined') {
        svg = addStyleToSvg(svg, 'svg', 'color', prependHashPerhaps(fgColor));
    }
    if (typeof bgColor !== 'undefined') {
        svg = addStyleToSvg(svg, 'svg', 'background-color', prependHashPerhaps(bgColor));
    }
    return svg;
};

/**
 * Render math.
 *
 * @param {Input} event Input event.
 * @returns {Promise<Output>}
 */
exports.render = async (event) => {
    if (event.input === 'mathml' && event.output === 'mathml') {
        // No-op conversion MathML-to-MathML.
        return { contentType: RESPONSE_TYPES.mathml, data: event.source };
    }

    const format = getFormat(event);
    const math = event.source;
    const fgColor = makeCssColor(prependHashPerhaps(event.foreground), event.foreground_alpha);
    const bgColor = makeCssColor(prependHashPerhaps(event.background), event.background_alpha);

    if (typeof math === 'undefined') {
        throw new SyntaxError(`Missing source`);
    }

    switch (event.output) {
        case 'mathml': {
            const res = await typeset({ math, format, mml: true });

            return { contentType: RESPONSE_TYPES.mathml, data: res };
        }

        case 'png': {
            const res = await typeset({ math, format, svg: true });
            const svg = makeInnerSvg(res, fgColor, bgColor);

            const { width, height } = event;
            const data = await svg2png(svg, { width, height });

            return { contentType: RESPONSE_TYPES.png, isBase64Encoded: true, data: data.toString('base64') };
        }

        case 'svg': {
            const res = await typeset({ math, format, svg: true });
            const svg = makeInnerSvg(res, fgColor, bgColor);

            return { contentType: RESPONSE_TYPES.svg, data: svg };
        }

        default:
            throw new SyntaxError(`Invalid output: ${event.output || ''}`);
    }
};

/**
 * Render math for AWS API Gateway.
 *
 * @param {ApiGatewayProxyEvent} event Incoming event.
 * @returns {Promise<ApiGatewayProxyResponse>}
 */
exports.handler = async (event) => {
    try {
        let input;
        if (event.httpMethod === 'GET') {
            input = event.queryStringParameters;
            if (typeof input.inline !== 'undefined') {
                input.inline = input.inline === '1';
            }
            if (typeof input.width !== 'undefined') {
                input.width = parseInt(input.width, 10);
            }
            if (typeof input.height !== 'undefined') {
                input.height = parseInt(input.height, 10);
            }
        } else {
            input = JSON.parse(event.body);
        }

        const { contentType, isBase64Encoded = false, data } = await this.render(input);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': contentType,
            },
            body: data,
            isBase64Encoded,
        };
    } catch (err) {
        if ( ! (err instanceof Error)) {
            throw new Error(err);
        }
        if ( ! (err instanceof SyntaxError) && ! err.message.startsWith('Invalid ')) {
            throw err;
        }

        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: err.message }),
        };
    }
};
