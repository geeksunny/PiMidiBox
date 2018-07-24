const fs = require('fs');

module.exports = {
    canReadWrite(filePath) {
        try {
            fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch (err) {
            return false;
        }
    },

    createdSoonerThan(filePathA, filePathB) {
        let statsA = fs.statSync(filePathA);
        let statsB = fs.statSync(filePathB);
        return statsA.birthtimeMs > statsB.birthtimeMs;
    },

    modifiedSoonerThan(filePathA, filePathB) {
        let statsA = fs.statSync(filePathA);
        let statsB = fs.statSync(filePathB);
        return statsA.mtimeMs > statsB.mtimeMs;
    },

    directoryExists(filePath) {
        try {
            return fs.statSync(filePath).isDirectory();
        } catch (err) {
            return false;
        }
    },

    fileExists(filePath) {
        try {
            return fs.statSync(filePath).isFile();
        } catch (err) {
            return false;
        }
    },

    readFileAsString(filePath) {
        try {
            return fs.readFileSync(filePath);
        } catch (err) {
            return false;
        }
    },

    readFileAsJSON(filePath) {
        try {
            let fileContents = fs.readFileSync(filePath);
            return JSON.parse(fileContents);
        } catch (err) {
            return null;
        }
    },

    saveObjectAsJSONFile(obj, filePath, prettyPrint = false) {
        try {
            let space = prettyPrint ? 4 : 0;
            fs.writeFileSync(filePath, JSON.stringify(obj, null, space));
            return true;
        } catch (err) {
            // TODO: Throw error here, probably
            return false;
        }
    }
};