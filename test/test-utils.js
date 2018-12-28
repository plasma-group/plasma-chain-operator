/* eslint-env mocha */

const chai = require('chai')
const expect = chai.expect
const utils = require('../utils.js')

describe('utils', function () {
  describe('addRange', () => {
    it('adds ranges and merges if possible', async () => {
      const addRange = utils.addRange
      const rangeList = [0, 1, 6, 10, 15, 17, 20, 20]
      addRange(rangeList, 5, 5)
      expect(rangeList).to.deep.equal([0, 1, 5, 10, 15, 17, 20, 20])
      addRange(rangeList, 3, 3)
      expect(rangeList).to.deep.equal([0, 1, 3, 3, 5, 10, 15, 17, 20, 20])
      addRange(rangeList, 2, 2)
      expect(rangeList).to.deep.equal([0, 3, 5, 10, 15, 17, 20, 20])
      addRange(rangeList, 4, 4)
      expect(rangeList).to.deep.equal([0, 10, 15, 17, 20, 20])
      addRange(rangeList, 18, 19)
      expect(rangeList).to.deep.equal([0, 10, 15, 20])
      addRange(rangeList, 11, 14)
      expect(rangeList).to.deep.equal([0, 20])
    })
  })

  describe('subtractRange', () => {
    it('removes ranges & splits them up if needed', async () => {
      const subtractRange = utils.subtractRange
      const rangeList = [0, 3, 6, 10, 15, 17, 18, 18]
      subtractRange(rangeList, 0, 3)
      expect(rangeList).to.deep.equal([6, 10, 15, 17, 18, 18])
      subtractRange(rangeList, 18, 18)
      expect(rangeList).to.deep.equal([6, 10, 15, 17])
      subtractRange(rangeList, 7, 7)
      expect(rangeList).to.deep.equal([6, 6, 8, 10, 15, 17])
      subtractRange(rangeList, 15, 17)
      expect(rangeList).to.deep.equal([6, 6, 8, 10])
      subtractRange(rangeList, 6, 6)
      expect(rangeList).to.deep.equal([8, 10])
      subtractRange(rangeList, 9, 9)
      expect(rangeList).to.deep.equal([8, 8, 10, 10])
      subtractRange(rangeList, 8, 8)
      expect(rangeList).to.deep.equal([10, 10])
      subtractRange(rangeList, 10, 10)
      expect(rangeList).to.deep.equal([])
    })
  })
})
