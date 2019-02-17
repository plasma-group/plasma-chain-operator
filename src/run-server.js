const Server = require('./server.js').Server
const readConfigFile = require('./utils.js').readConfigFile
const path = require('path')

const configFile = (process.env.CONFIG) ? process.env.CONFIG : path.join(__dirname, '../config.json')
const config = readConfigFile(configFile)

const server = new Server()

async function startup () {
  await server.startup(config)
}
startup()
