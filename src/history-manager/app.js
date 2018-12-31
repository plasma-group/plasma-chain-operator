var levelup = require('levelup')
var leveldown = require('leveldown')

// 1) Create our store
var db = levelup(leveldown('./history-db'))
console.log('New db:', db)

// 2) Put a key & value
process.on('message', (m) => {
  console.log('CHILD got message:', m)
})
