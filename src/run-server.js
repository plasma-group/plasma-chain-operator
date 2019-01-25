const server = require('./server.js')
const readConfigFile = require('./utils.js').readConfigFile
const path = require('path')

const configFile = (process.env.CONFIG) ? process.env.CONFIG : path.join(__dirname, '../config.json')
const config = readConfigFile(configFile)

async function startup () {
  await server.startup(config)
}
startup()
