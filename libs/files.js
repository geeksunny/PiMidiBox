const fs = require('fs');
const path = require('path');

module.exports = {
    getCurrentDirectoryBase : function() {
        return path.basename(process.cwd());
    },

    directoryExists : function(filePath) {
        try {
            return fs.statSync(filePath).isDirectory();
        } catch (err) {
            return false;
        }
    },

    fileExists : function(filePath) {
        try {
            return fs.statSync(filePath).isFile();
        } catch (err) {
            return false;
        }
    },

    readFileAsString: function(filePath) {
        try {
            return fs.readFileSync(filePath);
        } catch (err) {
            return false;
        }
    },

    readFileAsJSON: function(filePath) {
        try {
            let fileContents = fs.readFileSync(filePath);
            return JSON.parse(fileContents);
        } catch (err) {
            return null;
        }
    },

    saveObjectAsJSONFile: function(obj, filePath, prettyPrint = false) {
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