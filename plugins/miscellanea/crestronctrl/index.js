'use strict';

const libQ = require('kew');
const fs=require('fs-extra');
const config = new (require('v-conf'))();
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const io = require('socket.io-client');
const net = require('net');

let viosocket;

//declare global status variable
var status = 'na';

var mylogger;

var crestronState = {
	socket: null,
	power: 'na',
	volume: 'na',
}

module.exports = crestronctrl;

function crestronctrl(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	mylogger = this.logger;
	this.configManager = this.context.configManager;

}



crestronctrl.prototype.onVolumioStart = function()
{
	let self = this;
	const configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
	config.loadFile(configFile);
	self.config = config;
	self.logger.info(`CRESTRON: config loaded from ${configFile}. Port = ${self.config.get('port')}`);

	viosocket = io('http://localhost:3000');

	viosocket.on('error', (error) => {
		self.logger.error(`CRESTRON: Error from websocket: ${error}`)
	  });

	viosocket.on('connect', () => {
		self.logger.error(`CRESTRON: Connected to websocket.`)
	})

    return libQ.resolve();
}

crestronctrl.prototype.onStart = function() {
    var self = this;
	var defer=libQ.defer();

	self.load18nStrings();

	self.logger.info(`CRESTRON: vio socket connected: ${viosocket.connected}. ID: ${viosocket.id}`)
	// read and parse status once
    viosocket.emit('getState','');
    viosocket.once('pushState', self.parseStatus.bind(self));

    // listen to every subsequent status report from Volumio
    // status is pushed after every playback action, so we will be
    // notified if the status changes
    viosocket.on('pushState', self.parseStatus.bind(self));

	// Once the Plugin has successfull started resolve the promise
	defer.resolve();

    return defer.promise;
};

crestronctrl.prototype.onStop = function() {
    var self = this;
    var defer=libQ.defer();

    // Once the Plugin has successfull stopped resolve the promise
    defer.resolve();

    return libQ.resolve();
};

crestronctrl.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

crestronctrl.prototype.getUIConfig = function() {
    var defer = libQ.defer();
	var self = this;

	self.logger.info(`CRESTRON: vio socket connected: ${viosocket.connected}. ID: ${viosocket.id}`)
	
	self.logger.info('CRESTRON: Setting UI defaults')
	self.logger.info('Port: ' + self.config.get('port'));
    self.logger.info('IP: ' + self.config.get('crestron_ip'));
	self.logger.info('PowerPin: ' + self.config.get('powerid'));

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
        __dirname+'/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf)
        {
			self.logger.info("CRESTRON: UIConfig() data: " + JSON.stringify(uiconf));
			uiconf.sections[0].content[0].value = self.config.get('crestron_ip');
			uiconf.sections[0].content[1].value = self.config.get('port');
			uiconf.sections[0].content[2].value = self.config.get('powerid');

			// TODO: Read zone info from TCPDaemon and populate it into config so that we can:
			//  - choose which input this VolumIO is on
			//  - Select Zone outputs via the config page

            defer.resolve(uiconf);
        })
        .fail(function()
        {
            defer.reject(new Error());
        });

    return defer.promise;
};

crestronctrl.prototype.saveConfig = function (data) {
    var self = this;
    var defer = libQ.defer();

    self.logger.info("CRESTRON: saveConfig() data: " + JSON.stringify(data));

    self.config.set('crestron_ip', data.crestron_ip);
	self.config.set('port', data.port);
	self.config.set('powerid', data.powerid);

	if (crestronState.socket)
	{
		// Drop the socket connection and let it reconnect next time it's needed
		crestronState.power = 'na';
		crestronState.volume = 'na';
		crestronState.socket.end();
		crestronState.socket = null;
	}
    
    defer.resolve();

    self.commandRouter.pushToastMessage('success', self.getI18nString("SETTINGS_SAVED"), self.getI18nString("SETTINGS_SAVED_CONNECTION"));

    return defer.promise;
};

crestronctrl.prototype.getConfigurationFiles = function() {
	return ['config.json'];
}

crestronctrl.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

crestronctrl.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

crestronctrl.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};


// Control methods

// a pushState event has happened. Check whether it differs from the last known status and
// switch output port on or off respectively
crestronctrl.prototype.parseStatus = function(state) {
    var self = this;
		
	self.logger.info(`CRESTRON: parseStatus called with state: ${JSON.stringify(state)}`);
    if(state.status=='play' && state.status!=status){
        status=state.status;
		self.crestronOn();
    } else if((state.status=='pause' || state.status=='stop') && (status!='pause' && status!='stop')){
		status=state.status;			
    }

};

crestronctrl.prototype.crestronOn = function() {
	var self = this
	crestronctrl.prototype.sendCommand(`PUT /pulse/${config.get('powerid')}/1\r\n`, () => {
		crestronState.power = 'on';
		self.logger.info('CRESTRON: Amp powered on');
		self.commandRouter.pushToastMessage('success', self.getI18nString("POWERED_ON"));
	});
}

crestronctrl.prototype.sendCommand = function(cmd, callback) {
	if (crestronState.socket == null)
	{
		crestronctrl.prototype.createConnection(() => {
			crestronState.socket.write(cmd);
			callback(); 
		});
	}
	else
	{
		crestronState.socket.write(cmd);
		callback();
	}
}

crestronctrl.prototype.createConnection = function(callback) {
	const client = net.createConnection(config.get('port'),config.get('crestron_ip'),() => {
			mylogger.info('CRESTRON: TCP Connection established');
			callback();
		}
	);

	client.setTimeout(100000);

	client.on('data', (data) => {
		// ToDo: what to do with the data we receive from the Crestron
	});

	client.on('end', () => {
		mylogger.info('CRESTRON: TCP Connection ended');
		crestronState.socket = null;
		crestronState.power = 'na';
		crestronState.volume = 'na';
	});

	client.on('error', () => {
		mylogger.info('CRESTRON: TCP Connection closed on error');
		crestronState.socket = null;
		crestronState.power = 'na';
		crestronState.volume = 'na';
	});

	client.on('timeout', () => {
		mylogger.info('CRESTRON: TCP Connection closed on inactivity timeout');
		client.end();
		crestronState.socket = null;
		crestronState.power = 'na';
		crestronState.volume = 'na';
	})

	crestronState.socket = client;

	return client;
}


// Internationalization, copied from onkyo plugin
crestronctrl.prototype.load18nStrings = function () {
    var self = this;

    try {
        var language_code = this.commandRouter.sharedVars.get('language_code');
        self.i18nStrings = fs.readJsonSync(__dirname + '/i18n/strings_' + language_code + ".json");
    } catch (e) {
        self.i18nStrings = fs.readJsonSync(__dirname + '/i18n/strings_en.json');
    }

    self.i18nStringsDefaults = fs.readJsonSync(__dirname + '/i18n/strings_en.json');
};

crestronctrl.prototype.getI18nString = function (key) {
    var self = this;

    if (self.i18nStrings[key] !== undefined)
        return self.i18nStrings[key];
    else
        return self.i18nStringsDefaults[key];
};
