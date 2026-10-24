'use strict';

import MSP from './msp';
import MSPCodes from './msp/MSPCodes';
import mspHelper from './msp/MSPHelper';
import FC from './fc';
import GUI from './gui';
import CONFIGURATOR from './data_storage';
import i18n from './localization';
import serialPortHelper from './serialPortHelper';
import { ConnectionType } from './connection/connection';

// Index = log_level table value
const LEVELS = ['ERROR', 'WARNING', 'INFO', 'VERBOSE', 'DEBUG'];
// Index = bit number in log_topics (logTopic_e in the firmware's common/log.h)
const TOPICS = ['SYSTEM', 'GYRO', 'BARO', 'PITOT', 'PWM', 'TIMER', 'IMU', 'TEMPERATURE', 'POS_ESTIMATOR', 'VTX', 'OSD', 'CAN', 'TERRAIN', 'ADUM_RTK'];

const USB_VCP_IDENTIFIER = 20;

// The port that carries this MSP connection, which is where the firmware streams the log
function findLogPort() {
    const ports = FC.SERIAL_CONFIG.ports;
    const withLog = ports.find(port => port.functions.includes('LOG'));
    if (withLog) {
        return withLog;
    }

    const mspPorts = ports.filter(port => port.functions.includes('MSP'));
    const type = CONFIGURATOR.connection && CONFIGURATOR.connection.type;
    const isNetwork = type === ConnectionType.TCP || type === ConnectionType.UDP;
    if (isNetwork) {
        return mspPorts.find(port => port.identifier !== USB_VCP_IDENTIFIER) || mspPorts[0];
    }
    return mspPorts.find(port => port.identifier === USB_VCP_IDENTIFIER) || mspPorts[0];
}

function isLoggingEnabled() {
    return FC.SERIAL_CONFIG && FC.SERIAL_CONFIG.ports.some(port => port.functions.includes('LOG'));
}

function updateWarning() {
    $('#logging-warning').toggle(!!isLoggingEnabled());
}

// Show the global warning according to what the connected board has saved
function refreshWarning() {
    mspHelper.loadSerialPorts(updateWarning);
}

function hideWarning() {
    $('#logging-warning').hide();
}

function load(callback) {
    mspHelper.loadSerialPorts(function () {
        updateWarning();
        Promise.all([mspHelper.getSetting('log_level'), mspHelper.getSetting('log_topics')]).then(function (settings) {
            const [level, topics] = settings;
            const port = findLogPort();
            callback({
                supported: !!(level && topics && port),
                enabled: !!port && port.functions.includes('LOG'),
                level: level ? level.value : 0,
                topics: topics ? topics.value : 0,
                portName: port ? serialPortHelper.getPortName(port.identifier) : null,
            });
        }, function () {
            callback({ supported: false });
        });
    });
}

/**
 * Same as the CLI sequence "serial <id> 32769 ...", "set log_level", "set log_topics", "save".
 * @param {{enabled: boolean, level: number, topics: number}} settings
 * @param {function(boolean)} callback called only when the board is about to reboot, or with false when there is no log port
 */
function save(settings, callback) {
    mspHelper.loadSerialPorts(function () {
        const port = findLogPort();
        if (!port) {
            callback(false);
            return;
        }

        if (settings.enabled) {
            // The firmware only streams the log over MSP when the port is shared by exactly MSP and LOG
            port.functions = ['MSP', 'LOG'];
        } else {
            port.functions = port.functions.filter(name => name !== 'LOG');
        }

        const writeEeprom = function () {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                GUI.log(i18n.getMessage('configurationEepromSaved'));
                GUI.tab_switch_cleanup(function () {
                    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, function () {
                        GUI.log(i18n.getMessage('deviceRebooting'));
                        hideWarning();
                        GUI.handleReconnect($('.tab_sensors a'));
                    });
                });
                callback(true);
            });
        };

        mspHelper.saveSerialPorts(function () {
            if (settings.enabled) {
                mspHelper.setSetting('log_level', settings.level, function () {
                    mspHelper.setSetting('log_topics', settings.topics, writeEeprom);
                });
            } else {
                writeEeprom();
            }
        });
    });
}

export default {
    LEVELS,
    TOPICS,
    load,
    save,
    refreshWarning,
    hideWarning,
    msg: key => i18n.getMessage(key),
};
