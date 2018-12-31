const START_BYTE_SIZE = require('./constants.js').START_BYTE_SIZE
const TYPE_BYTE_SIZE = require('./constants.js').TYPE_BYTE_SIZE
const _ = require('lodash')

function addRange (rangeList, start, end, numSize) {
  if (numSize === undefined) {
    // Default to 16
    numSize = 16
  }
  // Find leftRange (a range which ends at the start of our tx) and right_range (a range which starts at the end of our tx)
  let leftRange, rightRange
  let insertionPoint = _.sortedIndexBy(rangeList, start, (n) => n.toString(16, numSize))
  // If the insertion point found an end poisition equal to our start, change it to the next index (find insertion on the right side)
  if (insertionPoint > 0 && insertionPoint < rangeList.length && insertionPoint % 2 === 1 && rangeList[insertionPoint].eq(start)) {
    insertionPoint++
  }
  if (insertionPoint > 0 && rangeList[insertionPoint - 1].eq(start)) {
    leftRange = insertionPoint - 2
  }
  if (insertionPoint < rangeList.length && rangeList[insertionPoint].eq(end)) {
    rightRange = insertionPoint
  }
  // Set the start and end of our new range based on the deleted ranges
  if (leftRange !== undefined) {
    start = rangeList[leftRange]
  }
  if (rightRange !== undefined) {
    end = rangeList[rightRange + 1]
  }
  // Delete the leftRange and rightRange if we found them
  if (leftRange !== undefined && rightRange !== undefined) {
    rangeList.splice(leftRange + 1, 2)
    return
  } else if (leftRange !== undefined) {
    rangeList.splice(leftRange, 2)
    insertionPoint -= 2
  } else if (rightRange !== undefined) {
    rangeList.splice(rightRange, 2)
  }
  rangeList.splice(insertionPoint, 0, start)
  rangeList.splice(insertionPoint + 1, 0, end)
}

function subtractRange (rangeList, start, end) {
  let affectedRange
  let arStart
  let arEnd
  for (let i = 0; i < rangeList.length; i += 2) {
    arStart = rangeList[i]
    arEnd = rangeList[i + 1]
    if (arStart.lte(start) && end.lte(arEnd)) {
      affectedRange = i
      break
    }
  }
  if (affectedRange === undefined) {
    throw new Error('No affected range found! Must be an invalid subtraction')
  }
  // Remove the effected range
  rangeList.splice(affectedRange, 2)
  // Create new sub-ranges based on what we deleted
  if (!arStart.eq(start)) {
    // # rangeList += [arStart, start - 1]
    rangeList.splice(affectedRange, 0, arStart)
    rangeList.splice(affectedRange + 1, 0, start)
    affectedRange += 2
  }
  if (!arEnd.eq(end)) {
    // # rangeList += [end + 1, arEnd]
    rangeList.splice(affectedRange, 0, end)
    rangeList.splice(affectedRange + 1, 0, arEnd)
  }
}

function getCoinId (type, start) {
  const buffers = [
    type.toArrayLike(Buffer, 'big', TYPE_BYTE_SIZE),
    start.toArrayLike(Buffer, 'big', START_BYTE_SIZE)
  ]
  return Buffer.concat(buffers)
}

// Create a defer function which will allow us to add our promise to the messageQueue
function defer () {
  const deferred = {
    promise: null,
    resolve: null,
    reject: null
  }
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}

module.exports = {
  addRange,
  subtractRange,
  defer,
  getCoinId
}
