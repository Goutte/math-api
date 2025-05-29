const { raw } = require('body-parser');
const express = require('express');
const { handler } = require('./render/index.js');

/** @typedef {{ resource: string, path: string, httpMethod: string, headers: { [x: string]: string }, queryStringParameters: { [x: string]: string }, pathParameters: { [x: string]: string }, body: string, isBase64Encoded: boolean }} LambdaProxyInput */
/** @typedef {{ statusCode: number, headers: { [x: string]: string }, body: string, isBase64Encoded: boolean }} LambdaProxyOutput */

/**
 * Convert ExpressJS incoming request to a Lambda proxy input event.
 *
 * @returns {LambdaProxyInput}
 */
express.request.constructor.prototype.toLambdaEvent = function () {
    return {
        resource: this.route.path,
        path: this.path,
        httpMethod: this.method,
        headers: Object.assign({}, this.headers || {}),
        // multiValueHeaders: { List of strings containing incoming request headers }
        queryStringParameters: Object.assign({}, this.query || {}),
        // multiValueQueryStringParameters: { List of query string parameters }
        pathParameters: Object.assign({}, this.params || {}),
        stageVariables: Object.assign({}, this.app.locals || {}),
        requestContext: {}, // TODO
        body: this.body,
        isBase64Encoded: false,
    };
};

/**
 * Build ExpressJS response from Lambda proxy output.
 *
 * @param {LambdaProxyOutput} res Lambda proxy response.
 * @returns {ThisType}
 */
express.response.constructor.prototype.fromLambdaResponse = function (res) {
    this.status(res.statusCode);
    if (res.headers) {
        this.set(res.headers);
    }
    if (res.body) {
        let buf = Buffer.from(res.body, res.isBase64Encoded ? 'base64' : 'utf8');
        this.set('Content-Length', buf.byteLength);
        this.write(buf);
    }
    this.end();

    return this;
};

const router = new express.Router();

// Landing page.
router
    .route('/')
    .get(async (req, res, _next) => {
        res.set('Content-Type', 'text/html');
        res.send(`
<html lang="en">
<header>
<title>LaTeX|MathML to MathML|SVG|PNG</title>
<style>
:root {
  --main-color: #3c3c3c;
  --main-bg-color: #e3e3e3;
  --link-color: inherit;
  --link-visited-color: inherit;
  --link-hover-color: inherit;
  --link-active-color: inherit;
}
@media screen and (prefers-color-scheme: dark) {
    :root {
      --main-color: #e3e3e3;
      --main-bg-color: #1c1c1c;
      --link-color: #ffa95c;
      --link-visited-color: #f1790e;
      --link-hover-color: #e5c09b;
      --link-active-color: #e9730b;
    }
}
@media print {
    :root {
      --main-color: #2c2c2c;
      --main-bg-color: #ffffff;
    }
}
body, textarea {
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
a:link { color: var(--link-color); }
a:visited { color: var(--link-visited-color); }
a:hover { color: var(--link-hover-color); }
a:active { color: var(--link-active-color); }
button[type=submit] {
    margin: 1em auto;
    padding: 0.62em 1em;
}
.endpoint {
    font-family: monospace;
    font-size: 1.62rem;
}
.parameter {
    font-size: 1.62rem;
}
</style>
</header>
<body>
<h1>Microservice to Convert LaTeX or MathML to MathML, SVG or PNG</h1>
<h2>Try it</h2>
<form action="/render" method="get">
<div>
    <label>
        Input Type:
        <select name="input">
            <option value="latex" selected>LaTeX</option>
            <option value="mathml">MathML</option>
        </select>
    </label>
    &nbsp;&nbsp;&nbsp;&nbsp;
    <label>
        Output Type:
        <select name="output">
            <option value="svg" selected>SVG</option>
            <option value="mathml">MathML</option>
            <option value="png">PNG</option>
        </select>
    </label>
</div>
<textarea name="source" cols="62" rows="10" required placeholder="Enter your LaTeX or MathML here…"></textarea>
<input type="hidden" name="width" value="512">
<input type="hidden" name="height" value="316">
<br>
<button type="submit">Convert</button>
</form>
<hr>
<h2>Endpoints Documentation</h2>
<h3 class="endpoint">GET /render</h3>
<h4>Query parameters</h4>
<ul>
<li>
    <code class="parameter">input</code> (<strong>required</strong>): the format of math in input.
    <p>
        <em>Valid values:</em>
        <code class="value">latex</code>,
        <code class="value">mathml</code>
    </p>
</li>
<li>
    <code class="parameter">output</code> (<strong>required</strong>): the output format.
    <p>
        <em>Valid values:</em>
        <code class="value">mathml</code>,
        <code class="value">svg</code>,
        <code class="value">png</code>
    </p>
</li>
<li>
    <code class="parameter">source</code> (<strong>required</strong>): the math to be rendered.
    Make sure it is URL-escaped.
    <p>
        <em>Valid value:</em> string type, depends on the input format.
    </p>
</li>
<li>
    <code class="parameter">inline</code> (<em>optional</em>): when input is latex, optionally enable "inline" mode.
    <p>
        <em>Valid values:</em>
        <code class="value">0</code>,
        <code class="value">1</code>
    </p>
</li>
<li>
    <code class="parameter">width</code>, <code class="parameter">height</code>  (<em>optional</em>):
    when output is <code>png</code>, specify the dimensions of the image to generate.
    <p>
        <em>Valid values:</em> positive integers.
    </p>
</li>
</ul>
<hr>
<h2>Credits</h2>
<ul>
    <li>
        <strong>License:</strong> MIT
    </li>
    <li>
        <strong>Source:</strong> <a href="https://github.com/Goutte/math-api">Goutte/math-api</a> on Github
    </li>
    <li>
        <strong>Forked from:</strong> <a href="https://github.com/chialabs/math-api">chialabs/math-api</a> on Github
    </li>
    <li>
        <strong>Contact:</strong>
        <a href="mailto:antoine.goutenoir@irap.omp.eu">antoine.goutenoir@irap.omp.eu</a> &amp;
        <a href="mailto:cmeny@irap.omp.eu">cmeny@irap.omp.eu</a>
    </li>
</ul>
<footer>
    &copy; <a href="https://m3p2.com">m3p2.com</a>
</footer>
</body>
</html>
        `);
    });

// Render endpoint.
router
    .route('/render')
    .get(async (req, res, next) => {
        try {
            res.fromLambdaResponse(await handler(req.toLambdaEvent()));
        } catch (err) {
            next(err);
        }
    })
    .post(async (req, res, next) => {
        try {
            res.fromLambdaResponse(await handler(req.toLambdaEvent()));
        } catch (err) {
            next(err);
        }
    });

// Assemble app.
module.exports = express()
    .use(raw({ type: '*/*' }))
    .use(router)
    .use((err, req, res, _next) => {
        // Error handling.
        console.error('Integration error', err);

        res.status(500)
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ message: 'Internal server error' }));
    });
