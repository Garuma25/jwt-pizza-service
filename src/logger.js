const config = require('./config.js');

function httpLogger(req, res, next) {
    try {
        let send = res.send;
        res.send = (resBody) => {
            const logData = {
                authorized: !!req.headers.authorization,
                path: req.originalUrl,
                method: req.method,
                statusCode: res.statusCode,
                reqBody: JSON.stringify(req.body),
                resBody: JSON.stringify(resBody),
            };
            const level = statusToLogLevel(res.statusCode);
            log(level, 'http', logData);
            res.send = send;
            return res.send(resBody);
        };
        next();
    } catch (error) {
        log('error', 'exception', {message:error.message});
    }  
};

function factoryLogger(reqBody, resBody, statusCode) {
    const logData = {
        authorized: true,
        path: `${config.factory.url}/api/order`,
        method: 'POST',
        statusCode: statusCode,
        reqBody: reqBody,
        resBody: JSON.stringify(resBody)
    }
    const level = statusToLogLevel(statusCode);
    log(level, 'http', logData);
}

function dbLogger(sql) {
    log('info', 'db', {reqBody: sql});
}

function log(level, type, logData) {
    const labels = { component: config.logging.source, level: level, type: type };
    const values = [nowString(), sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    sendLogToGrafana(logEvent);
}

function statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
}

function nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
}

function sanitize(logData) {
    logData = JSON.stringify(logData);
    return logData.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"').replace(/\\"jwt\\":\s*\\"[^"]*\\"/g, '\\"jwt\\": \\"*****\\"');
}

function sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    });
}

module.exports = { httpLogger, factoryLogger, dbLogger };