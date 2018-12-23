class State {
  constructor (db, callback) {
    this.db = db
  }

  async init () {
    // Get the current block number
    try {
      this.blocknumber = await this.db.get('blocknumber')
      console.log('Blocknumber found! Starting at: ' + this.blocknumber)
    } catch (err) {
      if (err.notFound) {
        console.log('No blocknumber found! Starting from block 0.')
        this.blocknumber = 0
        await this.db.put('blocknumber', this.blocknumber)
      } else { throw err }
    }
  }

  addDeposit (recipient, type, amount) {
  }
}

module.exports = State
