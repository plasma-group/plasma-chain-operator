const web3 = require('../eth.js')
const BN = web3.utils.BN
const utils = require('../utils.js')

class MockNode {
  constructor (state, account, peers) {
    this.state = state
    this.account = account
    this.peers = peers
    this.ranges = []
  }

  async deposit (tokenType, amount) {
    const deposit = await this.state.addDeposit(Buffer.from(web3.utils.hexToBytes(this.account.address)), tokenType, amount)
    const start = new BN(utils.getTokenId(deposit.type, deposit.start))
    const end = new BN(utils.getTokenId(deposit.type, deposit.end))
    utils.addRange(this.ranges, start, end)
  }
}

module.exports = MockNode
