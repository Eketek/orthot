/*
*/
orthot.util = {
  o2dirs:{
    1:libek.direction.code.SOUTH,
    2:libek.direction.code.WEST,
    4:libek.direction.code.UP,
    8:libek.direction.code.NORTH,
    16:libek.direction.code.EAST,
    32:libek.direction.code.DOWN,
  },
  parseO2Orientation(val) {
    val = Number.parseInt(val)
    let up = (val & 63)
    let fwd = ((val>>8) & 63)
    //  It seems that the convention from Orthot II was wrong.  
    up = orthot.util.o2dirs[up]    
    fwd = orthot.util.o2dirs[fwd]
    return {
      up:up,
      forward:fwd
    }
  },
  
}