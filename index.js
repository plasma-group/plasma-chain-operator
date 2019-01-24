const server = require('./src/server.js')
const ethService = require('./src/eth-service.js')
const readConfigFile = require('./src/utils.js').readConfigFile

module.exports = {
  startup: server.startup,
  ethService,
  readConfigFile
}
