/* eslint-env mocha */

const chai = require('chai')
const chaiHttp = require('chai-http')
const constants = require('../constants.js')
const accounts = require('./mock-accounts.js').accounts
const web3 = require('../eth.js')
const BN = web3.utils.BN
const State = require('../state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')

const expect = chai.expect

chai.use(chaiHttp)

describe('State', function () {
  describe('addDeposit', () => {
    let db = null
    let state = null
    before(async () => {
      db = levelup(leveldown('./test-db/' + +new Date()))
      state = new State.State(db)
      await state.init()
    })

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
      try {
        await state.addDeposit(addr0, ethType, depositAmount)
      } catch (err) {
        throw err
      }
      let totalEthDeposits = 0
      try {
        totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      } catch (err) { throw err }
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
    })
  })
})
