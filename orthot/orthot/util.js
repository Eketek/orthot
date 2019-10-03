export { parseO2Orientation, o2dirs }

import { direction } from '../libek/direction.js'

var o2dirs = {
  1:direction.code.SOUTH,
  2:direction.code.WEST,
  4:direction.code.UP,
  8:direction.code.NORTH,
  16:direction.code.EAST,
  32:direction.code.DOWN,
}
var parseO2Orientation = function(val) {
  val = Number.parseInt(val)
  let up = (val & 63)
  let fwd = ((val>>8) & 63)
  //  It seems that the convention from Orthot II was wrong.  
  up = o2dirs[up]    
  fwd = o2dirs[fwd]
  return {
    up:up,
    forward:fwd
  }
}