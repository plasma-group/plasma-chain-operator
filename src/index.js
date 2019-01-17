const server = require('./server.js')

async function startup () {
  await server.startup()
}
startup()
