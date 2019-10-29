export { direction, crossDirections, rotateDirection_bydirections, rotateVector_byvectors, rotation_byvectors, getKeyDirection, setOrientation }
import { T, rad_tosector } from './libek.js'

{
  let r = [
    0,
    [ 0, 0, 0, 4, 5, 6, 3 ],
    [ 0, 0, 0, 6, 3, 4, 5 ],
    [ 0, 6, 4, 0, 2, 0, 1 ],
    [ 0, 3, 5, 1, 0, 2, 0 ],
    [ 0, 4, 6, 0, 1, 0, 2 ],
    [ 0, 5, 3, 2, 0, 1, 0 ]
  ]

  var crossDirections = function(forward, up) {
    return r[up][forward]
  }
}

{
  let vec = new THREE.Vector3()
    //  Rotate a "heading" vector by a relational rotation ("from-to") derived from two sets of basis vectors
    //  This should probably be made somewhat more performant (possibly with a 7776 entry lookup table)
  var rotateDirection_bydirections= function(fromHEADING, fromFORWARD, fromUP, toFORWARD, toUP) {
    rotateVector_byvectors(
      vec,
      direction.vector[fromHEADING],
      direction.vector[fromFORWARD],
      direction.vector[fromUP],
      direction.vector[toFORWARD],
      direction.vector[toUP]
    )
    if (vec.x == -1) {
      return direction.code.EAST
    }
    if (vec.x == 1) {
      return direction.code.WEST
    }
    if (vec.y == -1) {
      return direction.code.DOWN
    }
    if (vec.y == 1) {
      return direction.code.UP
    }
    if (vec.z == -1) {
      return direction.code.SOUTH
    }
    if (vec.z == 1) {
      return direction.code.NORTH
    }
  }
}

{
  let mat = new THREE.Matrix4()
  let inv = new THREE.Matrix4()
  let vec = new THREE.Vector3()

    //  Rotate a "heading" vector by a relational rotation ("from-to") derived from two sets of basis vectors
  var rotateVector_byvectors = function(out, fromHEADING, fromFORWARD, fromUP, toFORWARD, toUP) {
    if (!fromHEADING.isVector3) {
      fromHEADING = direction.vector[fromHEADING]
    }
    if (!fromFORWARD.isVector3) {
      fromFORWARD = direction.vector[fromFORWARD]
      toFORWARD = direction.vector[toFORWARD]
      fromUP = direction.vector[fromUP]
      toUP = direction.vector[toUP]
    }

    vec.crossVectors(fromUP, fromFORWARD)
    mat.makeBasis(vec, fromUP, fromFORWARD)
    inv.getInverse(mat)

    out.copy(fromHEADING)
    out.applyMatrix4(inv)

    vec.crossVectors(toUP, toFORWARD)
    mat.makeBasis(vec, toUP, toFORWARD)
    //inv.getInverse(mat)

    out.applyMatrix4(mat)
  }
}

{

  let mat = new THREE.Matrix4()
  let inv = new THREE.Matrix4()
  let vec = new THREE.Vector3()

    //  Set a THREE.Quaterion or THREE.Euler to a relational rotation ("from-to") derived from two sets of basis vectors
  var rotation_byvectors = function(out, fromHEADING, fromFORWARD, fromUP, toFORWARD, toUP) {
    if (!fromHEADING.isVector3) {
      fromHEADING = direction.vector[fromHEADING]
    }
    if (!fromFORWARD.isVector3) {
      fromFORWARD = direction.vector[fromFORWARD]
      toFORWARD = direction.vector[toFORWARD]
      fromUP = direction.vector[fromUP]
      toUP = direction.vector[toUP]
    }

    vec.crossVectors(fromUP, fromFORWARD)
    mat.makeBasis(vec, fromUP, fromFORWARD)
    inv.getInverse(mat)

    vec.crossVectors(toUP, toFORWARD)
    mat.makeBasis(vec, toUP, toFORWARD)
    //inv.getInverse(mat)

    mat.multiply(inv)
    out.setFromRotationMatrix(mat)
  }
}

{
  let inside_orientation = [
    //UP
    [ 0,0,
      { rotation:new THREE.Euler(0, T*0.50, 0), position:new THREE.Vector3() },
      { rotation:new THREE.Euler(0, T*0.25, 0), position:new THREE.Vector3() },
      { rotation:new THREE.Euler(0, T*0.00, 0), position:new THREE.Vector3() },
      { rotation:new THREE.Euler(0, T*0.75, 0), position:new THREE.Vector3() }  ],

    //down
    [ 0,0,
      { rotation:new THREE.Euler(0, T*0.50, T*0.50), position:new THREE.Vector3(0,1,0) },
      { rotation:new THREE.Euler(0, T*0.25, T*0.50), position:new THREE.Vector3(0,1,0) },
      { rotation:new THREE.Euler(0, T*0.00, T*0.50), position:new THREE.Vector3(0,1,0) },
      { rotation:new THREE.Euler(0, T*0.75, T*0.50), position:new THREE.Vector3(0,1,0) }  ],

    //north
    [ {rotation:new THREE.Euler(T*0.75, T*0.50, 0), position:new THREE.Vector3(0,0.5,0.5) },
      {rotation:new THREE.Euler(T*0.75, T*0.00, 0), position:new THREE.Vector3(0,0.5,0.5) },
      0,
      {rotation:new THREE.Euler(T*0.75, T*0.25, 0), position:new THREE.Vector3(0,0.5,0.5) },
      0,
      {rotation:new THREE.Euler(T*0.75, T*0.75, 0), position:new THREE.Vector3(0,0.5,0.5) }  ],

    //east
    [ { rotation:new THREE.Euler(T*0.25, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.75, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.50, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
      0,
      { rotation:new THREE.Euler(T*0.00, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
      0                                                                                       ],

    //south
    [ { rotation:new THREE.Euler(T*0.25, T*0.00, 0), position:new THREE.Vector3(0,0.5,-0.5) },
      { rotation:new THREE.Euler(T*0.25, T*0.50, 0), position:new THREE.Vector3(0,0.5,-0.5) },
      0,
      { rotation:new THREE.Euler(T*0.25, T*0.25, 0), position:new THREE.Vector3(0,0.5,-0.5) },
      0,
      { rotation:new THREE.Euler(T*0.25, T*0.75, 0), position:new THREE.Vector3(0,0.5,-0.5) }  ],

    //west
    [ { rotation:new THREE.Euler(T*0.25, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.75, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.50, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
      0,
      { rotation:new THREE.Euler(T*0.00, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
      0,                                                                                       ],
  ]
  let outside_orientation = [
    //UP
    [ 0,0,
      { rotation:new THREE.Euler(0, T*0.50, 0), position:new THREE.Vector3(0,1,0) },
      { rotation:new THREE.Euler(0, T*0.25, 0), position:new THREE.Vector3(0,1,0) },
      { rotation:new THREE.Euler(0, T*0.00, 0), position:new THREE.Vector3(0,1,0) },
      { rotation:new THREE.Euler(0, T*0.75, 0), position:new THREE.Vector3(0,1,0) }  ],

    //down
    [ 0,0,
      { rotation:new THREE.Euler(0, T*0.50, T*0.50), position:new THREE.Vector3() },
      { rotation:new THREE.Euler(0, T*0.25, T*0.50), position:new THREE.Vector3() },
      { rotation:new THREE.Euler(0, T*0.00, T*0.50), position:new THREE.Vector3() },
      { rotation:new THREE.Euler(0, T*0.75, T*0.50), position:new THREE.Vector3() }  ],

    //north
    [ {rotation:new THREE.Euler(T*0.25, T*0.50, 0), position:new THREE.Vector3(0,0.5, 0.5) },
      {rotation:new THREE.Euler(T*0.25, T*0.00, 0), position:new THREE.Vector3(0,0.5, 0.5) },
      0,
      {rotation:new THREE.Euler(T*0.25, T*0.25, 0), position:new THREE.Vector3(0,0.5, 0.5) },
      0,
      {rotation:new THREE.Euler(T*0.25, T*0.75, 0), position:new THREE.Vector3(0,0.5, 0.5) }  ],

    //east
    [ { rotation:new THREE.Euler(T*0.25, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.75, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.50, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
      0,
      { rotation:new THREE.Euler(T*0.00, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
      0                                                                                       ],

    //south
    [ { rotation:new THREE.Euler(T*0.75, T*0.00, 0), position:new THREE.Vector3(0,0.5, -0.5) },
      { rotation:new THREE.Euler(T*0.75, T*0.50, 0), position:new THREE.Vector3(0,0.5, -0.5) },
      0,
      { rotation:new THREE.Euler(T*0.75, T*0.25, 0), position:new THREE.Vector3(0,0.5, -0.5) },
      0,
      { rotation:new THREE.Euler(T*0.75, T*0.75, 0), position:new THREE.Vector3(0,0.5, -0.5) }  ],

    //west
    [ { rotation:new THREE.Euler(T*0.25, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.75, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
      { rotation:new THREE.Euler(T*0.50, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
      0,
      { rotation:new THREE.Euler(T*0.00, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
      0,                                                                                       ],
  ]



  /* Rotate and position a THREE.Object3D to set it so that it's origin is at the center of the face of a unit cube, its up axis points in the "up" (+Y) direction, and
     its forward axis (-Z) is pointed in the "forward" direction.

     This presently uses a set of 24 hard-coded presets, but it really should compute it (so as to allow two-vector orientation).
  */
  var setOrientation = function(out, forward, up, inside=true) {
    if (!out) {
      out = {}
    }
    if (typeof(up) == "string") {
      up = direction.code[up.toUpperCase()]
    }
    if (typeof(forward) == "string") {
      forward = direction.code[forward.toUpperCase()]
    }

    if (inside) {
      Object.assign(out, inside_orientation[up-1][forward-1])
    }
    else {
      Object.assign(out, outside_orientation[up-1][forward-1])
    }
    return out
  }
}


var direction = {
  code:{
    NODIR:0,
    UP:1,
    DOWN:2,
    NORTH:3,
    EAST:4,
    SOUTH:5,
    WEST:6,
  },
  name:[ "nodir", "up", "down", "north", "east", "south", "west" ],

  // Cartesian vectors to represent each direction
  vector:{
    UP:new THREE.Vector3(0,1,0),
    DOWN:new THREE.Vector3(0,-1,0),
    NORTH:new THREE.Vector3(0,0,1),
    EAST:new THREE.Vector3(-1,0,0),
    SOUTH:new THREE.Vector3(0,0,-1),
    WEST:new THREE.Vector3(1,0,0),

    up:new THREE.Vector3(0,1,0),
    down:new THREE.Vector3(0,-1,0),
    north:new THREE.Vector3(0,0,1),
    east:new THREE.Vector3(-1,0,0),
    south:new THREE.Vector3(0,0,-1),
    west:new THREE.Vector3(1,0,0),

    1:new THREE.Vector3(0,1,0),
    2:new THREE.Vector3(0,-1,0),
    3:new THREE.Vector3(0,0,1),
    4:new THREE.Vector3(-1,0,0),
    5:new THREE.Vector3(0,0,-1),
    6:new THREE.Vector3(1,0,0),
  },

  invert:     [0, 2, 1, 5, 6, 3, 4],
  right:      [0, 1, 2, 4, 5, 6, 3],
  left:       [0, 1, 2, 6, 3, 4, 5],
}
direction.sideorientations = [
  0,
  setOrientation(null, direction.code.NORTH, direction.code.UP, false),
  setOrientation(null, direction.code.SOUTH, direction.code.DOWN, false),
  setOrientation(null, direction.code.UP, direction.code.NORTH, false),
  setOrientation(null, direction.code.UP, direction.code.EAST, false),
  setOrientation(null, direction.code.UP, direction.code.SOUTH, false),
  setOrientation(null, direction.code.UP, direction.code.WEST, false)
]


{
  let _keycodetbl = {
    up:0,
    right:1,
    down:2,
    left:3,
  }
  let _keyvector = [
    { vector:new THREE.Vector3( 0, 0, -1), inv:new THREE.Vector3( 0,  0,  1), code:direction.code.SOUTH },   //south
    { vector:new THREE.Vector3( 1, 0,  0), inv:new THREE.Vector3(-1,  0,  0), code:direction.code.WEST },   //west
    { vector:new THREE.Vector3( 0, 0,  1), inv:new THREE.Vector3( 0,  0, -1), code:direction.code.NORTH },   //north
    { vector:new THREE.Vector3(-1, 0,  0), inv:new THREE.Vector3( 1,  0,  0), code:direction.code.EAST },   //east
  ]

  var getKeyDirection = function(key, camtheta) {
    return _keyvector[(_keycodetbl[key] + rad_tosector(-camtheta+T*0.125,4)) % 4]
  }
}
















