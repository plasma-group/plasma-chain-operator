/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const State = require('../state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const accounts = require('./mock-accounts.js').accounts
const BN = require('../eth.js').utils.BN
// const tSerializer = require('../transaction-serialization.js')
const MockNode = require('./mock-node.js')
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

  describe.only('addDeposit', () => {
    it('should work', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      const nodes = []
      for (const acct of accounts) {
        nodes.push(new MockNode(state, acct, nodes))
      }
      // Add 100 deposits of value 10 from 100 different accounts
      for (let i = 0; i < 5; i++) {
        for (const node of nodes) {
          await node.deposit(ethType, depositAmount)
        }
      }
      // const ownedRanges = await state.getOwnedRanges(accounts[0].address)
      // expect(ownedRanges.length).to.equal(5)
    })
  })
})
