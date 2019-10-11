export { Container }

import { direction } from '../libek/direction.js'

/*  Containers represent one unit of space which an Orthot Object (solid or spatially-positioned Puzzle element) may occupy.

    In additional to helping structure the data, Containers also provide queries and helper functions
        (rather than scattering many queries throughout puzzle element code)
*/
var Container = function(x,y,z) {
  this.x = x
  this.y = y
  this.z = z
  this.content = []
  this.id = `${x}|${y}|${z}`

  // Somewhat lazy adjacentcy test.  Returns true if one of the other container's coordinates differs by 1.  This assumes that coordinates have integer values.
  this.isAdjacent = function(other) {
    return ((Math.abs(x-other.x) + Math.abs(y-other.y) + Math.abs(z-other.z)) == 1)
  }

  this.push = function(force) {
    let internalOBJ_moved
    for (let internalOBJ of this.content) {
      if (internalOBJ.push(force)) {
        internalOBJ_moved = internalOBJ
      }
      else if (internalOBJ.hasSides) {
        let pside = direction.invert[force.toHEADING]
        let attachments = internalOBJ.sides[pside]
        for (let sobj of attachments) {
          if (sobj.push) {
            sobj.push(force)
          }
        }
      }
    }
    if (internalOBJ_moved) {
      force.OBJ.notify_PushClearedObstruction(force, internalOBJ_moved)
      return true
    }
    return false
  }

  this.addObject = function(obj) {
    this.content.push(obj)
    for (let other of this.content) {
      if (other != obj) {
        other.intruded(obj)
        obj.intrude(other)
      }
    }
  }
  
  this.removeObject = function(obj) {
    let idx = this.content.indexOf(obj)
    if (idx != -1) {
      this.content.splice(idx, 1)
      for (let other of this.content) {
        if (other.departed) {
          other.departed(obj)
        }
      }
    }
  }

  /*  Query the container for an object matching the specified type
  */
  this.getObject_bytype = function(type) {
    if (type) {
      for (let obj of this.content) {
        if (obj.types.indexOf(type) != -1) {
          return obj
        }
      }
    }
  }

  /*  Query the container for an object matching any specified spatial class
  */
  this.getObject_byspatialclass = function(sclass) {
    if (!Array.isArray(sclass)) {
      sclass = [sclass]
    }
    for (let obj of this.content) {
      if (sclass.indexOf(obj.SpatialClass) != -1) {
        return obj
      }
    }
  }

  /*  An object is moving out of some container other than this one, into a container which is adjacent to this container
   *
   *  heading:
   *    Apparent direction of movement.  This either is the literal heading of the originating force or is the direction as transformed by a portal
   *    which points at the location the object is moving into
   *  normal:
   *    A vector pointing toward the space which the object is moving into
   *  originatingForce:
   *    The [primary] force which is causing this secondary force to be applied
   */
  this.applyInboundIndirectForce = function(heading, normal, from_normal, originatingForce) {
    for (let obj of this.content) {
      obj.__applyInboundIndirectForce__(heading, normal, from_normal, originatingForce)
    }
  }

  /*  An object is moving out of an adjacent container, into some container other than this one
   *
   *  heading:
   *    Apparent direction of movement.  This either is the literal heading of the originating force or is the direction as transformed by a portal
   *    which points at the location the object is moving away from
   *  normal:
   *    A vector pointing toward the space which the object is moving away from
   *  originatingForce:
   *    The [primary] force which is causing this secondary force to be applied
   */
  this.applyOutboundIndirectForce = function (heading, normal, from_normal, originatingForce) {
    for (let obj of this.content) {
      obj.__applyOutboundIndirectForce__(heading, normal, from_normal, originatingForce)
    }
  }

  /*  Query the container for a side-attachment.  (This is mainly for finding portals and ladders)
  */
  this.getSideobject_bytype = function(side, type) {
    for (let obj of this.content) {
      let sideobj = obj.getSideobject_bytype(side, type)
      if (sideobj) {
        return sideobj
      }
    }
  }
}






