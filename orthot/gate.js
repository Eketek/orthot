export { Gate, GateGroup }

import { trit, getAsset, Material } from '../libek/libek.js'
import { direction, crossDirections, setOrientation } from '../libek/direction.js'
import { parseColor } from '../libek/util.js'

import { orthotCTL } from './orthot.js'
import { StandardObject } from './object.js'
import { Surface } from './surface.js'
import { GateState, Strength } from './enums.js'
import { AnimateBlock } from './animation.js'
import { scan_gate } from './topology.js'

var GateGroup = function(zone, _gate) {
  this.gates = [_gate]
  this.up = _gate.up
  this.right = _gate.forward
      
  this.extend_code = _gate.extend
  this.retract_code = _gate.retract
  this.initial_state = _gate.initial_state
  this.toggle_code = _gate.toggle
  this.code = _gate.code
  
  this.backward = crossDirections(_gate.forward, _gate.up)
  this.forward = direction.invert[this.backward]
  
  this.before = zone.getAdjacentCTN(this.gates[0].ctn, this.backward)
  
  this.merge = (function(other) {  
    //Fail if the other group points some other direction.
    if ((this.up != other.up) || (this.right != other.right)) {
      return false
    }
    
    let merged = false
    
    // If a pair of end-gates are adjacent, merge in the other group's gates and ensure that gates are ordered by how distant they are from the retract to or
    //  extend from. 
    if (zone.getAdjacentCTN(this.gates[this.gates.length-1].ctn, this.forward) == other.gates[0].ctn) {
      for (let i = 0; i < other.gates.length; i++) {
        this.gates.push(other.gates[i])
      }
      merged = true
    }
    else if (zone.getAdjacentCTN(this.gates[0].ctn, this.backward) == other.gates[other.gates.length-1].ctn) {
      for (let i = other.gates.length-1; i >= 0; i--) {
        this.gates.unshift(other.gates[i])
      }
      this.before = zone.getAdjacentCTN(this.gates[0].ctn, this.backward)
      merged = true
    }
    
    if (merged) {
      if (other.extend_code) {
        this.extend_code = other.extend_code
      }
      if (other.retract_code) {
        this.retract_code = other.retract_code
      }
      if (other.initial_state) {
        this.initial_state = other.initial_state
      }
      if (other.toggle_code) {
        this.toggle_code = other.toggle_code
      }
      if (other.code) {
        this.code = other.code
      }
    }
    return merged 
  }).bind(this)
  
  let position = 0
  
  this.init = (function() {
    // A gategroup with a code property obstructs unless User's progress satisfies whatever arbitrary condition specified by the code.
    //  (in which case, all gates are to be deleted)
    if (this.code && this.code != "") {
      if (orthotCTL.matchCode(this.code)) {          
        for (let gate of this.gates) {
          zone.removeGameobject(gate)
          return
        }
      }
    }
    for (let gate of this.gates) {
      gate.initGraphics()
      if (!gate.worldpos) {
        gate.worldpos = gate.obj.position
      }
      gate.worldpos.set(gate.ctn.x, gate.ctn.y, gate.ctn.z)
      gate.ready()
    }
  
    switch(this.initial_state) {
      case "open":
      case "retracted":
        this.state = GateState.RETRACTED
        position = 0
        break
      case "closed":
      case "close":
      case "extended":
      default:
        this.state = GateState.EXTENDED
        position = this.gates.length
        for (let gate of this.gates) {
          zone.putGameobject(gate.ctn, gate)
          zone.scene.add(gate.obj)
        }
        break
    }
    
    let extend = (function() {
    
      switch(this.state) {
        case GateState.RETRACTED:
          this.state = GateState.EXTENDING
          this.update()
          zone.addTickListener(this.update)
          break
        case GateState.RETRACTING:
          this.state = GateState.EXTENDING
          break
      }      
      
      this.state = GateState.EXTENDING
      if (this.state != GateState.EXTENDED) {
        zone.addTickListener(this.update)
      }
    }).bind(this)
    
    let retract = (function() {
      switch(this.state) {
        case GateState.EXTENDED:
          this.state = GateState.RETRACTING
          this.update()
          zone.addTickListener(this.update)
          break
        case GateState.EXTENDING:
          this.state = GateState.RETRACTING
          break
      }      
    }).bind(this)
    
    let toggle = (function() {
      switch(this.state) {
        case GateState.EXTENDED:
          this.state = GateState.RETRACTING
          this.update()
          zone.addTickListener(this.update)
          break
        case GateState.EXTENDING:
          this.state = GateState.RETRACTING
          break
        case GateState.RETRACTED:
          this.state = GateState.EXTENDING
          this.update()
          zone.addTickListener(this.update)
          break
        case GateState.RETRACTING:
          this.state = GateState.EXTENDING
          break
      }
    }).bind(this)
    
    if ( (this.extend_code) || (this.retract_code) || (this.toggle_code) ) {
      if (this.extend_code) {
        for (let code of this.extend_code.split(',')) {
          zone.addSignalreceiver(code, extend)
        }
      }
      if (this.retract_code) {
        for (let code of this.retract_code.split(',')) {
          zone.addSignalreceiver(code, retract)
        }
      }
      if (this.toggle_code) {
        for (let code of this.toggle_code.split(',')) {
          zone.addSignalreceiver(code, toggle)
        }
      }
    }
    
    this.update = (function() {
      let gate
      switch(this.state) {
        case GateState.EXTENDED:
          zone.removeTickListener(this.update)
          break
        case GateState.RETRACTED:
          zone.removeTickListener(this.update)
          break
        case GateState.EXTENDING:
          if (position == this.gates.length) {
            this.state = GateState.EXTENDED
            zone.removeTickListener(this.update)
            break
          }
          gate = this.gates[this.gates.length-position-1]
          zone.putGameobject(this.before, gate)
          zone.scene.add(gate.obj)
          for (let i = this.gates.length-position-1; i < this.gates.length; i++) {
            gate = this.gates[i]
            let force = scan_gate(zone, gate.ctn, gate, this.forward, gate.forward, gate.up)
            force.action = "extend"
            force.strength = Strength.CRUSHING
            zone.addForce(force)
          }
          position++
          break
        case GateState.RETRACTING: 
          if (position != this.gates.length) {
            gate = this.gates[this.gates.length-position-1]
            zone.removeGameobject(gate, false)
            zone.scene.remove(gate.obj)
          }
          if (position == 0) {
            this.state = GateState.RETRACTED
            zone.removeTickListener(this.update)
            break
          }          
          for (let i = this.gates.length-position; i < this.gates.length; i++) {
            gate = this.gates[i]
            let force = scan_gate(zone, gate.ctn, gate, this.backward, gate.forward, gate.up)
            force.action = "retract"
            zone.addForce(force)
          }
          position--
          break
      }
    }).bind(this)
  }).bind(this)
}

var Gate = function(zone, ctn, color, align, data) {
  StandardObject.call(this, zone)
  this.ctn = ctn
  
  if (data.e) {
    this.extend = data.e
  }
  else if (data.extend) {
    this.extend = data.extend
  }
  
  if (data.r) {
    this.retract = data.r
  }
  else if (data.retract) {
    this.retract = data.retract
  }
  
  this.initial_state = data.state
  if (data.t) {
    this.toggle = data.t
  }
  else if (data.toggle) {
    this.toggle = data.toggle
  }
  
  this.code = data.code
  
  this.hasSides = true
  this.setBaseSurface(Surface.type.SMOOTH)
    
  this.SpatialClass = "solid"  
  
  this.forward = align.forward
  this.up = align.up
  
  this.behind = crossDirections(this.forward, this.up)
  
  let ss = [0,0,0,0,0,0,0]
  ss[this.up] = Strength.HARD
  ss[direction.invert[this.up]] = Strength.HARD
  ss[direction.invert[this.behind]] = Strength.HARD
  this.shearStrength = ss
  
  if (!color) {
    color = "white"
  }
  if (!color.isColor) {
    color = parseColor(color)
  }
  
  this.mdlgen = function() {
    let mdl = getAsset(orthotCTL.assets, "gate")
    mdl.children[0].material = Material(color)    
    return mdl
  }
    
  this.initGraphics = function() {
    AnimateBlock(zone, this)
    setOrientation(this.animCTL.orientation, this.forward, this.up)   
    this.ready()
    return true
  }
  
  this.move = function(force) {
    zone.putGameobject(force.toCTN, this)
    this.animCTL.shift(force)
    return trit.TRUE
  }
  
  this.hasMovementPriority = function(this_force, other_force, collisiontype) { 
    return true
  }
}