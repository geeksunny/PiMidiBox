const drivelist = require('drivelist');
const mountutils = require('mountutils');
const usbDetect = require('usb-detection');
const tools = require('./tools');

/**
 * Callback to be executed upon USB device add / remove events.
 *
 * @callback usbHandler
 * @param {Event} event - The connection event taking place.
 * @param {UsbDevice} drive - The USB device issuing the connection event.
 */

/**
 * Callback to be executed upon drive add / remove events.
 *
 * @callback driveHandler
 * @param {Event} event - The connection event taking place.
 * @param {Drive} drive - The drive issuing the connection event.
 */

const Event = tools.enum('ADD', 'REMOVE');

// TODO: Auto-unmounter to use blacklist of drives to ignore; blacklist based on device-IDs, possibly other criteria such as disk-size. (npm: hdd-space)

class Drive {
    constructor(driveInfo) {
        this._info = driveInfo;
    }

    // TODO: getters for useful drive identification information
    get isReadOnly() {
        return this._info.isReadOnly;
    }

    get isSystem() {
        return this._info.isSystem;
    }

    get mountpoints() {
        return this._info.mountpoints;
    }

    unmount() {
        let tasks = [];
        for (let mountPoint of this._info.mountpoints) {
            tasks.push(new Promise((resolve, reject) => {
                mountutils.unmountDisk(mountPoint, (err) => {
                    if (err) {
                        reject({ name: mountPoint, success: false, error: err });
                    }
                    resolve({ name: mountPoint, success: true });
                });
            }));
        }
        return Promise.all(tasks);
    }

    // get mounted() {
    //     // TODO?
    // }
}

class UsbDevice {
    constructor(deviceInfo) {
        this._info = deviceInfo;
        this._name = this._info.deviceName.replace(/_/g, ' ');
    }

    get name() {
        return this._name;
    }

    get info() {
        return this._info;
    }
}

class UsbMonitor {
    constructor() {
        this._usbHandlers = [];
        this._driveHandlers = [];
        this._driveTimeout = 1000;
        this._started = false;
    }

    startMonitoring() {
        if (this._started) {
            return;
        }
        this._started = true;
        usbDetect.on('add', (device) => {
            this._onAdd(device);
        });
        usbDetect.on('remove', (device) => {
            this._onRemove(device);
        });
        usbDetect.startMonitoring();
    }

    stopMonitoring() {
        if (!this._started) {
            return;
        }
        usbDetect.removeAllListeners('add');
        usbDetect.removeAllListeners('remove');
        usbDetect.stopMonitoring();
        this._started = false;
    }

    stopWatching(handler) {
        return tools.removeFromArray(handler, this._driveHandlers)
            || tools.removeFromArray(handler, this._usbHandlers);
    }

    watchDevices(usbHandler) {
        if (this._usbHandlers.indexOf(usbHandler) > -1) {
            return;
        }
        this._usbHandlers.push(usbHandler);
    }

    watchDrives(driveHandler) {
        if (this._driveHandlers.indexOf(driveHandler) > -1) {
            return;
        }
        this._driveHandlers.push(driveHandler);
    }

    _isDrive(event) {
        return new Promise((resolve, reject) => {
            drivelist.list((err, drives) => {
                if (err) {
                    reject(err);
                }
                let before = {};
                for (let drive of drives) {
                    before[drive.raw] = drive;
                }
                setTimeout(() => {
                    drivelist.list((err_, drives_) => {
                        if (err_) {
                            reject(err_);
                        }
                        let pool = (event === Event.ADD)
                            ? { from: drives_, to: drives }
                            : { from: drives, to: drives_ };
                        for (let device in pool.from) {
                            if (!(device in pool.to)) {
                                resolve({ result: true, drive: pool.from[device] });
                            }
                        }
                        resolve({ result: false });
                    });
                }, this._driveTimeout);
            })
        });
    }

    // noinspection JSMethodCanBeStatic
    _dispatchEvent(event, handlers, data) {
        for (let handler of handlers) {
            handler(event, data);
        }
    }

    _onDevice(event, device) {
        if (!this.watchingDrives) {
            this._isDrive(event).then((result) => {
                if (result.result) {
                    this._dispatchEvent(event, this._driveHandlers, new Drive(result.drive));
                } else {
                    this._dispatchEvent(event, this._usbHandlers, new UsbDevice(device));
                }
            }).catch((err) => {
                throw err;
            });
        } else {
            this._dispatchEvent(event, this._usbHandlers, new UsbDevice(device));
        }
    }

    _onAdd(device) {
        this._onDevice(Event.ADD, device);
    }

    _onRemove(device) {
        this._onDevice(Event.REMOVE, device);
    }

    get monitoring() {
        return this._started;
    }

    get driveTimeout() {
        return this._driveTimeout;
    }

    set driveTimeout(timeout) {
        if (!Number.isInteger(timeout) || timeout <= 0) {
            return;
        }
        this._driveTimeout = timeout;
    }

    get watchingDrives() {
        return !!this._driveHandlers.length;
    }
}

module.exports = { Drive: Drive, Device: UsbDevice, Event: Event, Monitor: new UsbMonitor() };