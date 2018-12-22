const levelup = require('levelup')
const leveldown = require('leveldown')

const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = 3000

app.use(bodyParser.json())

// POST method route
app.post('/add-transaction', function (req, res) {
  console.log('yo!')
  console.log(req.body)
  console.log('yo!')
  res.send('POST request to the homepage')
})

console.log(levelup, leveldown)

app.listen(port, () => console.log(`Operator listening on port ${port}!`))

module.exports = app
