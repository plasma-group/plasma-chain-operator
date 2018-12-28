/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const State = require('../state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
// const tSerializer = require('../transaction-serialization.js')
// const MockNode = require('./mock-node.js')
// const expect = chai.expect

chai.use(chaiHttp)

describe('MockNode', function () {
  let db
  let state
  const startNewDB = async () => {
    db = levelup(leveldown('./test-db/' + +new Date()))
    // Create a new tx-log dir for this test
    const txLogDirectory = './test-db/' + +new Date() + '-tx-log/'
    fs.mkdirSync(txLogDirectory)
    // Create state object
    state = new State.State(db, txLogDirectory)
    await state.init()
  }
  beforeEach(startNewDB)
})
