/**
 * Simple log export service example which captures messages of specifed categories and levels
 * and transmits them to a remote API in batch, once a certin batch size or timeout is reached.
 * 
 * The service will come up as soon as possible during finsemble startup - but will inevitably
 * not be able to capture so of the earliest log messages.
 * 
 * Look for //TODO: comments for where to customize the service to your needs
 * 
 * N.B. Be wary of adding too many Logger messages within this service as it will of course receive
 * back to transmit onwards
 */
const Finsemble = require("@chartiq/finsemble");
const RouterClient = Finsemble.Clients.RouterClient;
const Logger = Finsemble.Clients.Logger;
const Request = require("superagent");
Logger.start();

// Add and initialize any other clients you need to use 
//   (services are initialised by the system, clients are not)
// let ConfigClient = Finsemble.Clients.ConfigClient;
// ConfigClient.initialize();

// Settings 
/** Transmit queued messages when their number reaches or exceeds this amount. */
const BATCH_SIZE = 100;
/** Wait at most this number of milliseconds after first message in batch is received before transmitting. */
const TIMEOUT_MILLISECS = 30 * 1000;
/** Wait at most this number of milliseconds for batch transmission to complete */
const TRANSMIT_TIMEOUT_MILLISECS = 10 * 1000;
/** Log levels of messsages to capture. Valid values: Error, Warning, Log, Info, Debug, Verbose */
const CAPTURE_LOG_LEVELS = {
	"Log": true, 
	"Warn": true, 
	"Error": true
};
/** Log categories of messages to capture. Valid values: system, dev or perf */
const CAPTURE_LOG_CATEGORIES = { 
	"system": true, 
	"dev": true
};
/** Where to transmit the logs to */
//TODO: Update to your logging endpoint
const LOGGING_ENDPOINT = "http://localhost/loggingendpoint";


/**
 * Log messages arrive in small batches from each logger and must be added to an export batch and 
 * transmitted. 
 * 
 * @constructor
 */
function loggingexportService() {
	const self = this;
	let timeout = null;
	let batchAllocSize = BATCH_SIZE + 10;     //add a small amount of leeway on batch size
	let logBatch = new Array(batchAllocSize); //pre-init the batch array to reduce array allocations
	let currBatchSize = 0;
	let msgTmp

	/**
	 * Add an incoming array of log messages to the batch and transmit if thresholds met.
	 * 
	 * Logging message format:
	 *		[										
	 *			{
	 *				"category": "system",				//Log message type: system, dev or perf
	 *				"logClientName": "Finsemble",		//The registered name of the logger instance
	 *				"logType": "Log",					//Log level: Error, Warning, Log, Info, Debug, Verbose
	 *				"logData": "[\"SERVICE LIFECYCLE: STATE CHANGE: Service initializing\",\"windowService\"]",
	 *													//JSON encoded erray of message and data components of the log message
	 *													//N.B. maybe be prefixed by string "*** Logging Error: ""
	 *				"logTimestamp": 1544090028391.6226	//Log message timestamp for ordering use
	 *			}, 
	 *			{...},
	 *			...
	 *		]
	 * @private
	 */
	this.addToBatch = function (dataArr) {
		if (dataArr) {
			for (let m = 0; m < dataArr.length; m++) {
				if (CAPTURE_LOG_CATEGORIES[dataArr[m].category] && CAPTURE_LOG_LEVELS[dataArr[m].logType]) {
					//TODO: add any necessary message format changes here
					logBatch[currBatchSize++] = dataArr[m];
				} 
				// else {
				// 	console.log("discarding message",  dataArr[m]);
				// }
			}

			if(currBatchSize >= BATCH_SIZE){
				self.transmitBatch();
			} else if (!timeout) { //always transmit batch within minimum timeout
				timeout = setTimeout(self.transmitBatch, TIMEOUT_MILLISECS);
			}
		} else {
			Logger.warn("Tried to add an invalid data array to log batch",  dataArr);
		}
	}

	/**
	 * Transmit the batch to the remote log collection endpoint.
	 * @private
	 */
	this.transmitBatch = function () {
		clearTimeout(timeout);
		//trim batch array to length
		let toTransmit = logBatch;
		toTransmit.splice(currBatchSize, logBatch.length-currBatchSize);
		
		//reset
		timeout = null;
		logBatch = new Array(batchAllocSize);
		currBatchSize = 0;
		
		//sort the batch by timestamp if necessary - however note that due to the async nature 
		// of logging you might still send a later batch containing messages with a lower 
		// logTimestamp. Hence, best avoided if messages will be sorted elsewhere.
		//toTransmit.sort((a, b) => a.logTimestamp - b.logTimestamp);

		//transmit batch
		//TODO: Customize batch transmission here
		//console.log('Batch to transmit: ' + JSON.stringify(toTransmit, null, 2));

		//See SuperAgent docs for request options: https://visionmedia.github.io/superagent/
		Request
			.post(LOGGING_ENDPOINT)	
			.withCredentials()		// set this for CORS requests
			.type('json')
			.timeout({response: TRANSMIT_TIMEOUT_MILLISECS})
			.send({
				logMessages: toTransmit
			})
			.then(res => {
				console.log("Log batch transmitted: ", res);
			})
			.catch(err => {
				console.error("Log batch transmission failure: ", err);
			});
	}

	/**
	 * Create a router listener for log messages. 
	 * @private
	 */
	this.createRouterEndpoints = function () {
		RouterClient.addListener("logger.service.logMessages", function(error, logMessage) {
			if (!error) {
				self.addToBatch(logMessage.data);
			} else {
				Logger.error("Failed to setup LoggingExportService listener", error);
			}
		});
	};

	return this;
};

loggingexportService.prototype = new Finsemble.baseService({
	startupDependencies: {
		// Don't depend on any clients or services so that we start-up ASAP
		services: [],
		clients: []
	}
});
const serviceInstance = new loggingexportService('loggingexportService');

serviceInstance.onBaseServiceReady(function (callback) {
	serviceInstance.createRouterEndpoints();
	callback();
});

serviceInstance.start();
module.exports = serviceInstance;