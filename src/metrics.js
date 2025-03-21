const config = require('./config');
const os = require('os');

const requests = {};

function requestTracker() {
  return (req, res, next) => {
    requests[req.method] = (requests[req.method] || 0) + 1;
    console.log(`Metrics: Received new request with method: ${req.method}`)
    next();
  };
}

setInterval(() => {
  Object.keys(requests).forEach((requestType) => {
    metrics('requests', requests[requestType], {requestType}, '1');
  });

  metrics('cpu_usage', getCpuUsagePercentage());
  metrics('memory_usage', getMemoryUsagePercentage());
}, 10000);

function metrics(metricName, metricValue, attributes) {
  attributes = {...attributes, source: config.metrics.source};

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: '1',
                sum: {
                  dataPoints: [
                    {
                      asInt: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                      attributes: [],
                    },
                  ],
                  aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
                  isMonotonic: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  Object.keys(attributes).forEach((key) => {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].attributes.push({
      key: key,
      value: {stringValue: attributes[key]},
    });
  });

  fetch(`${config.metrics.url}`, {
    method: 'POST',
    body: JSON.stringify(metric),
    headers: {Authorization: `Bearer ${config.metrics.apiKey}`, 'Content-Type': 'application/json'},
  })
      .then((response) => {
        if (!response.ok) {
          console.error('Failed to push metrics data to Grafana');
        } else {
          console.log(`✅ Pushed ${metricName}`);
        }
      })
      .catch((error) => {
        console.error('❌ Error pushing metrics:', error);
      });
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
 
  return Math.floor(memoryUsage);
}

module.exports = { requestTracker };