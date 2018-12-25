/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const constants = require('../constants.js')
const accounts = require('./mock-accounts.js').accounts
const web3 = require('../eth.js')
const BN = web3.utils.BN
const State = require('../state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const tSerializer = require('../transaction-serialization.js')

const expect = chai.expect

chai.use(chaiHttp)

describe('State', function () {
  let db
  let state
  beforeEach(async () => {
    db = levelup(leveldown('./test-db/' + +new Date()))
    // Create a new tx-log dir for this test
    const txLogDirectory = './test-db/' + +new Date() + '-tx-log/'
    fs.mkdirSync(txLogDirectory)
    // Create state object
    state = new State.State(db, txLogDirectory)
    await state.init()
  })

  describe('addDeposit', () => {
    it('increments total deposits by the deposit amount', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // There should be no total deposits record
      try {
        await db.get(State.getTotalDepositsKey(ethType))
        // If this succeeded something is going wrong
        throw new Error('Expected no entry for this type')
      } catch (err) {
        if (!err.notFound) throw err
        // Otherwise we (correctly) have no total_deposits record for this type
      }
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      let totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
    })
  })
  describe('startNewBlock', () => {
    it('increments the current blocknumber', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      let totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
      // Increment the blocknumber
      await state.startNewBlock()
      expect(state.blocknumber).to.deep.equal(new BN(1))
    })

    it('should lock deposits while changing blocknumber', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      // Now add a bunch of conflicting deposits. This will trigger a bunch of locks
      for (let i = 0; i < 20; i++) {
        state.addDeposit(addr0, ethType, depositAmount).then((res) => {
          console.log('Added deposit. New total deposits: ', res)
        })
      }
      let totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      console.log('this is our total deposits:' + new BN(totalEthDeposits))
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
      // Increment the blocknumber
      await state.startNewBlock()
      expect(state.blocknumber).to.deep.equal(new BN(1))
    })
  })
  describe('addTransaction', () => {
    it('should be correct', async () => {
      const tr1 = new tSerializer.SimpleSerializableElement([accounts[0].address, accounts[2].address, 1, 2, 3, 4], tSerializer.schemas.TransferRecord)
      const tr2 = new tSerializer.SimpleSerializableElement([accounts[1].address, accounts[2].address, 2, 3, 4, 5], tSerializer.schemas.TransferRecord)
      const sig1 = new tSerializer.SimpleSerializableElement([12345, 56789, 901234], tSerializer.schemas.Signature)
      const sig2 = new tSerializer.SimpleSerializableElement([12346, 56790, 901235], tSerializer.schemas.Signature)
      const trList = new tSerializer.SimpleSerializableList([tr1, tr2], tSerializer.schemas.TransferRecord)
      const sigList = new tSerializer.SimpleSerializableList([sig1, sig2], tSerializer.schemas.Signature)
      console.log('Encodings:')
      console.log(Buffer.from(trList.encode()))
      console.log(Buffer.from(sigList.encode()))
    })
  })
})
