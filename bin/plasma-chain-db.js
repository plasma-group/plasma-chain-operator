#!/usr/bin/env node
const program = require('commander')
const fs = require('fs');
const path = require('path');
const colors = require('colors') // eslint-disable-line no-unused-vars
const readConfigFile = require('../src/utils.js').readConfigFile
const configFile = (process.env.CONFIG) ? process.env.CONFIG : path.join(__dirname, '..', 'config.json')
const config = readConfigFile(configFile)
program
  .command('kill')
  .description('Destroy operator database contents (dangerous)')
  .action(async () => {
    if (!fs.existsSync(config.dbDir)) {
      console.error("Operator database does not exist. Exiting.".red)
    } else {
        try{
            rimraf(config.dbDir)
            console.log("Operator database successfully deleted".green)
        } catch(e) {
            console.log("Error deleting databse:".red, e)
        }
        process.exit()
    }
  })

program.parse(process.argv)

if (program.args.length === 1) {
console.log('Command not found. Try `' + 'operator help db'.yellow + '` for more options')
}

function rimraf(dir_path) {
    fs.readdirSync(dir_path).forEach(function(entry) {
        var entry_path = path.join(dir_path, entry);
        if (fs.lstatSync(entry_path).isDirectory()) {
            rimraf(entry_path);
        } else {
            fs.unlinkSync(entry_path);
        }
    });
    fs.rmdirSync(dir_path);
}