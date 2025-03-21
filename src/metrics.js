const config = require('./config').metrics;
const os = require('os');

const unprocessedData = { // The data structure to hold the logs
    http_latencies: [],
    http_req_num: {
        get: 0,
        put: 0,
        post: 0,
        delete: 0
    },
    revenue: 0,
    pizza_purchases: 0,
    pizza_purchase_failures: 0,
    pizza_latencies: [],
    auth_success: 0,
    auth_failure: 0,
    active_users: new Map()
}

const requestTracker = (req, res, next) => { // The middle ware for the requests to go and log them
    const start = Date.now();
    const handler = () => {
        const end = Date.now();
        const duration = end - start;

        if (['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
            unprocessedData.http_latencies.push(duration);

            switch (req.method) {
                case 'GET':
                    unprocessedData.http_req_num.get += 1;
                    break;
                case 'POST':
                    unprocessedData.http_req_num.post += 1;
                    break;
                case 'PUT':
                    unprocessedData.http_req_num.put += 1;
                    break;
                case 'DELETE':
                    unprocessedData.http_req_num.delete += 1;
                    break;
                default:
                    return;
            }

            if(req.originalUrl == '/api/auth' && req.method == 'DELETE') {
                // Remove from active if logged out
                if(req.statusCode != 200 && req.user != null) {
                    unprocessedData.active_users.delete(req.user.email);
                    return;
                }
            }

            // Handle purchase metrics
            if (req.originalUrl == '/api/order' && req.method == 'POST') {
                unprocessedData.pizza_latencies.push(duration);
                if (res.statusCode != 200) {
                    unprocessedData.pizza_purchase_failures += 1;
                    return;
                }
                unprocessedData.pizza_purchases += 1;
                for (const item of req.body.items) {
                    unprocessedData.revenue += item.price;
                }
            }

            // Handle authentication metrics
            else if(req.originalUrl == '/api/auth' && ['POST', 'PUT'].includes(req.method)) {
                if(res.statusCode != 200) {
                    unprocessedData.auth_failure += 1;
                    return;
                }
                unprocessedData.auth_success += 1;
                // Add to active users
                unprocessedData.active_users.set(req.body.email, Date.now() * 1000000);
            }
        }
    };

    res.on('finish', handler);
    res.on('close', handler);
    next();
};



class MetricBuilder {
    constructor() {
        this.metrics = []
    }

    append(metricName, metricValue, type, unit) {
        return this.appendFromList(metricName, [metricValue], type, unit);
    }

    appendFromList(metricName, metricList, type, unit) {
        const dataPoints = [];
        for (const value of metricList) {
            dataPoints.push({
                asDouble: value,
                timeUnixNano: Date.now() * 1000000,
                attributes: [
                    {
                        key: "source",
                        value: { "stringValue": config.source }
                    }
                ]
            });
        }
        if (dataPoints.length == 0) {
            return;
        }
        this.metrics.push({
            name: metricName,
            unit: unit,
            [type]: {
                dataPoints: dataPoints,
                ...(type == 'sum' && {
                    aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                    isMonotonic: true
                })
            },
        })
    }

    toString() {
        const metric = {
            resourceMetrics: [
                {
                    scopeMetrics: [
                        {
                            metrics: this.metrics
                        },
                    ],
                },
            ],
        };

        return JSON.stringify(metric);
    }
}

function getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return memoryUsage.toFixed(2);
}

async function sendMetricToGrafana(body) { // the function that send over the information in bulk
    await fetch(config.url, {
        method: 'POST',
        body: body,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    })
        .then((response) => {
            if (!response.ok) {
                response.text().then((text) => {
                    console.error(`Failed to push metrics data to Grafana: ${text}`);
                    console.error(body);
                });
            } else {
                console.log(`Pushed metrics`);
            }
        })
        .catch((error) => {
            console.error('Error pushing metrics:', error);
        });
}
function zeroOut() {
    // Zeroing out the unprocessed data structure
    unprocessedData.http_latencies = [];
    unprocessedData.pizza_purchases = 0;
    unprocessedData.http_latencies = []
    unprocessedData.http_req_num.get = unprocessedData.http_req_num.put = unprocessedData.http_req_num.post = unprocessedData.http_req_num.delete = unprocessedData.pizza_purchase_failures = unprocessedData.revenue = unprocessedData.auth_success = unprocessedData.auth_failure = 0;
    // Should not clear unprocessedData.active_users
}
function sendMetricsPeriodically(period) { // Sets the timer in which the metrics are sent
    return setInterval(async () => {
        console.log('Sending metrics...')
        try {
            const buf = new MetricBuilder();
            httpMetrics(buf);
            systemMetrics(buf);
            userMetrics(buf);
            purchaseMetrics(buf);
            authMetrics(buf);
            zeroOut();

            const metrics = buf.toString();
            await sendMetricToGrafana(metrics);
        } catch (error) {
            console.log('Error sending metrics', error);
        }
    }, period);
}

function httpMetrics(builder) {
    builder.appendFromList('latency', unprocessedData.http_latencies, 'sum', 'ms');
    builder.append('get_requests', unprocessedData.http_req_num.get, 'sum', '1');
    builder.append('put_requests', unprocessedData.http_req_num.put, 'sum', '1');
    builder.append('post_requests', unprocessedData.http_req_num.post, 'sum', '1');
    builder.append('delete_requests', unprocessedData.http_req_num.delete, 'sum', '1');
}

function systemMetrics(builder) { // Sending the cpu and memory values
    const cpuUsage = getCpuUsagePercentage();
    const memoryUsage = getMemoryUsagePercentage();
    builder.append('cpu_usage', cpuUsage, 'gauge', '%');
    builder.append('memory_usage', memoryUsage, 'gauge', '%');
}

function userMetrics(builder) {
    builder.append('active_users', unprocessedData.active_users.size, 'sum', '1');
}

function purchaseMetrics(builder) { // Pizza latency, pizza errors and pizza purchases
    builder.appendFromList('pizza_latency', unprocessedData.pizza_latencies, 'sum', 'ms');
    builder.append('pizza_purchases', unprocessedData.pizza_purchases, 'sum', '1');
    builder.append('pizza_errors', unprocessedData.pizza_purchase_failures, 'sum', '1');
    builder.append('revenue', unprocessedData.revenue, 'sum', '1');
}

function authMetrics(builder) {
    builder.append('auth_success', unprocessedData.auth_success, 'sum', '1');
    builder.append('auth_failure', unprocessedData.auth_failure, 'sum', '1');
}

module.exports = { sendMetricsPeriodically, requestTracker }