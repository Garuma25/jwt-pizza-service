const config = require('./config').metrics;
const os = require('os');

const unprocessedData = { 
    http_req_num: { get: 0, put: 0, post: 0, delete: 0 },
    revenue: 0,
    pizza_purchases: 0,
    pizza_purchase_failures: 0,
    request_latency: [],
    pizza_creation_latency: [],
    auth_success: 0,
    auth_failure: 0,
    active_users: new Map()
};

const requestTracker = (req, res, next) => { 
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;

        if (['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
            // Track request count
            unprocessedData.http_req_num[req.method.toLowerCase()] += 1;
            unprocessedData.request_latency.push(duration);
        }

        // Handle purchases
        if (req.originalUrl === '/api/order' && req.method === 'POST') {
            unprocessedData.pizza_creation_latency.push(duration);
            if (res.statusCode !== 200) {
                unprocessedData.pizza_purchase_failures += 1;
            } else {
                unprocessedData.pizza_purchases += 1;
                req.body.items.forEach(item => unprocessedData.revenue += item.price);
            }
        }

        // Handle authentication
        if (req.originalUrl === '/api/auth' && ['POST', 'PUT'].includes(req.method)) {
            if (res.statusCode !== 200) {
                unprocessedData.auth_failure += 1;
            } else {
                unprocessedData.auth_success += 1;
                unprocessedData.active_users.set(req.body.email, Date.now());
            }
        }
    });

    next();
};

class MetricBuilder {
    constructor() {
        this.metrics = [];
    }

    append(metricName, metricValue, type, unit) {
        return this.appendFromList(metricName, [metricValue], type, unit);
    }

    appendFromList(metricName, metricList, type, unit) {
        const dataPoints = metricList.map(value => ({
            asDouble: value,
            timeUnixNano: Date.now() * 1000000,
            attributes: [{ key: "source", value: { "stringValue": config.source } }]
        }));
        
        if (dataPoints.length > 0) {
            this.metrics.push({
                name: metricName,
                unit: unit,
                [type]: {
                    dataPoints: dataPoints,
                    ...(type === 'sum' && {
                        aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                        isMonotonic: true
                    })
                }
            });
        }
    }

    toString() {
        return JSON.stringify({ resourceMetrics: [{ scopeMetrics: [{ metrics: this.metrics }] }] });
    }
}

function getCpuUsagePercentage() {
    return ((os.loadavg()[0] / os.cpus().length) * 100).toFixed(2);
}

function getMemoryUsagePercentage() {
    return (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2);
}

async function sendMetricToGrafana(body) {
    try {
        const response = await fetch(config.metrics.url, { // ✅ FIXED
            method: 'POST',
            body: body,
            headers: {
                Authorization: `Bearer ${config.metrics.apiKey}`, // ✅ FIXED
                'Content-Type': 'application/json'
            },
        });
    
        if (!response.ok) {
            console.error(`❌ Failed to push metrics: ${response.status}`);
            console.error(await response.text()); // Logs error response from Grafana
        } else {
            console.log(`✅ Pushed metrics successfully`);
        }
    } catch (error) {
        console.error('❌ Error pushing metrics:', error);
    }
}

function zeroOut() {
    unprocessedData.request_latency = [];
    unprocessedData.pizza_creation_latency = [];
    unprocessedData.pizza_purchases = 0;
    unprocessedData.pizza_purchase_failures = 0;
    unprocessedData.revenue = 0;
    unprocessedData.auth_success = 0;
    unprocessedData.auth_failure = 0;
    Object.keys(unprocessedData.http_req_num).forEach(key => unprocessedData.http_req_num[key] = 0);
}

function sendMetricsPeriodically(period) { 
    return setInterval(async () => {
        try {
            const builder = new MetricBuilder();
            httpMetrics(builder);
            systemMetrics(builder);
            userMetrics(builder);
            purchaseMetrics(builder);
            authMetrics(builder);
            zeroOut();

            await sendMetricToGrafana(builder.toString());
        } catch (error) {
            console.log('Error sending metrics:', error);
        }
    }, period);
}

function httpMetrics(builder) {
    builder.append('get_requests', unprocessedData.http_req_num.get, 'sum', '1');
    builder.append('put_requests', unprocessedData.http_req_num.put, 'sum', '1');
    builder.append('post_requests', unprocessedData.http_req_num.post, 'sum', '1');
    builder.append('delete_requests', unprocessedData.http_req_num.delete, 'sum', '1');
    builder.appendFromList('request_latency', unprocessedData.request_latency, 'sum', 'ms');
}

function systemMetrics(builder) {
    builder.append('cpu_usage', getCpuUsagePercentage(), 'gauge', '%');
    builder.append('memory_usage', getMemoryUsagePercentage(), 'gauge', '%');
}

function userMetrics(builder) {
    builder.append('active_users', unprocessedData.active_users.size, 'sum', '1');
}

function purchaseMetrics(builder) {
    builder.append('pizza_purchases', unprocessedData.pizza_purchases, 'sum', '1');
    builder.append('pizza_errors', unprocessedData.pizza_purchase_failures, 'sum', '1');
    builder.append('revenue', unprocessedData.revenue, 'sum', '1');
    builder.appendFromList('pizza_creation_latency', unprocessedData.pizza_creation_latency, 'sum', 'ms');
}

function authMetrics(builder) {
    builder.append('auth_success', unprocessedData.auth_success, 'sum', '1');
    builder.append('auth_failure', unprocessedData.auth_failure, 'sum', '1');
}

module.exports = { sendMetricsPeriodically, requestTracker };
