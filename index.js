const Server = require('./src/server.js').Server
const ethService = require('./src/eth-service.js')
const readConfigFile = require('./src/utils.js').readConfigFile

const server = new Server()

module.exports = {
  startup: server.startup,
  ethService,
  readConfigFile
}
