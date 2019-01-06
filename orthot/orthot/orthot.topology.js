/*  Topological query functions for moving puzzle elements.
*/
orthot.topology = {
  /*  topological scan that checks only the forward space
   *
   *  Scan:
   *  Check forward always
  */
  scan_simple:function(zone, loc, obj, heading, forward, up=libek.direction.code.UP) {
    let fromCTN = loc
    let fromHEADING = heading
    let fromFORWARD = forward
    let fromUP = up
            
    let [adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
        
    // If down but a floor-type entity obstructing, clear the traversable flag
    if (fromHEADING == libek.direction.code.DOWN) {
      isTraversable &= !fromCTN.getObject_bytype("floor")
    }
    
    //Scan toCTN on inbound face for a portal 
    //  If found, traverse the portal (+ any connected portals) to find its destination
    //    toCTN = portal-destination
    //    toDIR = portal-redirect
    
    let hop = {
      adjCTN:adjCTN,
      fromCTN:fromCTN,
      fromHEADING:fromHEADING,
      fromFORWARD:fromFORWARD,
      fromUP:fromUP,
      toCTN:toCTN,
      toHEADING:toHEADING,
      toFORWARD:toFORWARD,
      toUP:toUP,
      isPortaljump:isPortaljump,
    }
    
    
    let r = Object.assign( {
      OBJ:obj,
      priority:0,
      path:[hop],
      isPortaljump:isPortaljump,
      isTraversable:function() {
        return zone.isTraversable(fromCTN, fromHEADING, toCTN, toHEADING, obj)
      },
    }, hop )
    
    let _
    
    // Check for open space under destination, so that creatures popping out of portals can decide whether to right themselves mid-air 
    // or whether to flop over on the ground.  
    // If you want a reasonable explanation, Eketek isn't going to give it..  Maybe your quandary could be exacerbated by accosting a random physics professor!
    [_, _, _, _, _, _, isTraversable] = zone.getLocalTopology(obj, toCTN, libek.direction.code.DOWN, toFORWARD, toUP)
    if (isTraversable) {
      r.isOVERHOLE = true
    }
    
    return r
  },
  
  /*  topological scan that checks spaces needed by ramp-enabled movers
   *
   *  Scan:
   *  Check forward always
   *  If forward is open and contains an aligned ramp, add the space above the ramp
   *  If forward is open but does not contain a ramp, check the space below
  */
  scan_ramp:function(zone, loc, obj, heading, forward, up=libek.direction.code.UP) {  
    
    let fromCTN = loc
    let fromHEADING = heading
    let fromFORWARD = forward
    let fromUP = up
    
    let _isTraversable = true
    let _isPortaljump = false
    
    let adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable, ramp
    
    let r = { 
      OBJ:obj,
      priority:0,
      path:[],      //Used by animation system for handling portals.  Eventually, the movement engine will need this for certain special cases
      fromCTN:loc,
      fromHEADING:heading,
      fromFORWARD:forward,
      fromUP:up
    }
    
    let appendHop = function() {
      r.path.push({
        adjCTN:adjCTN,
        fromCTN:fromCTN,
        fromHEADING:fromHEADING,
        fromFORWARD:fromFORWARD,
        fromUP:fromUP,
        toCTN:toCTN,
        toHEADING:toHEADING,
        toFORWARD:toFORWARD,
        toUP:toUP,
        isTraversable:isTraversable,
        isPortaljump:isPortaljump,
      })  
    }
    
    let downramp_or_flat = true
    
    ramp = fromCTN.getObject_bytype("ramp")
    if (ramp) {
      //If on a ramp and ascending
      if (ramp.ascendDIR == fromHEADING) {
        ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromUP, fromFORWARD, fromUP)
        _isTraversable &= isTraversable
        _isPortaljump |= isPortaljump      
        appendHop()
        
        // Should adjust this at some point to allow down-facing-portal on top of stairs.  But... this would involve either more complexity or properly
        //  handling objects which have a split-location.
        
        ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, toCTN, fromHEADING, fromFORWARD, fromUP)
        //;[adjCTN, toCTN, toDIR, toUPDIR, isPortaljump, isTraversable] = zone.getLocalTopology(obj, toCTN, fromDIR, toUPDIR)
        _isTraversable &= isTraversable
        _isPortaljump |= isPortaljump
        appendHop()
              
        r.toCTN = toCTN
        r.toHEADING = toHEADING
        r.toFORWARD = toFORWARD
        r.toUP = toUP
        downramp_or_flat = false
        
        r.fromUPRAMP = true
        
      }
      
      //If on a ramp and moving along it (not asending or descending)
      else if (ramp.descendDIR != fromHEADING) {
        ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
        //;[adjCTN, toCTN, toDIR, toUPDIR, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromDIR, fromUPDIR)
        //console.log([toCTN, toDIR, toUPDIR, isPortaljump, isTraversable])
        _isTraversable &= isTraversable
        _isPortaljump |= isPortaljump
        
        appendHop()
        
        r.toCTN = toCTN
        r.toHEADING = toHEADING
        r.toFORWARD = toFORWARD
        r.toUP = toUP
        
        //The center of a ramp is 0.5 units above the origin, so any object should occupy both stacked stacked spaces while moving  ...
        
        let low_toCTN = toCTN
        let low_toHEADING = toHEADING
        let low_toFORWARD = toFORWARD
        let low_toUP = toUP
        
        // Should adjust this at some point to allow down-facing-portal on top of stairs.  But... this would involve either more complexity or properly
        //  handling objects which have a split-location.
        let upperCTN = zone.getAdjacentCTN(fromCTN, fromUP)
              
        // ... If there just happens to be a pair of portals ahead, these should obviously be stepped through ...
        ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, upperCTN, fromHEADING, fromFORWARD, fromUP)
        //;[adjCTN, toCTN, toDIR, toUPDIR, isPortaljump, isTraversable] = zone.getLocalTopology(obj, upperCTN, fromDIR, fromUPDIR)
        _isTraversable &= isTraversable
        _isPortaljump |= isPortaljump
        //appendHop()
        
        r.upper_toCTN = toCTN
        r.upper_toHEADING = toHEADING
        r.upper_toFORWARD = toFORWARD
        r.upper_toUP = toUP
        
        // ... 
        if (isPortaljump) {
          if (toCTN != upperCTN) {
            r.uhoh = true
            r.upper_displaced = true
          }
          if (toHEADING != low_toHEADING) {
            r.uhoh = true
            r.upper_rotated = true
          }
          if (toUP != low_toUP) {
            r.uhoh = true
            r.upper_reoriented = true
          }
        }
        r.fromUNALIGNEDRAMP = true
        if (isTraversable) {
          ramp = low_toCTN.getObject_bytype("ramp")
          if (!ramp) {
            r.toGAP = true
          }
          else if (ramp.ascendDIR == low_toHEADING) {
            r.toUPRAMP = true
          }
          else if (ramp.descendDIR == low_toHEADING) {          
            _isTraversable = false
            r.toBLOCKINGRAMP = true
          }
          else {
            r.toUNALIGNEDRAMP = true
          }
        }
        
        downramp_or_flat = false
      }
      else {
        r.fromDOWNRAMP = true
      } 
    }
    
    // If not on a ramp or on a ramp and descending    
    if (downramp_or_flat) {
      
      ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
      //;[adjCTN, toCTN, toDIR, toUPDIR, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromDIR, fromUPDIR)
      //console.log([toCTN, toDIR, toUPDIR, isPortaljump, isTraversable])
      _isTraversable &= isTraversable
      _isPortaljump |= isPortaljump
      
      r.toCTN = toCTN
      r.toHEADING = toHEADING
      r.toFORWARD = toFORWARD
      r.toUP = toUP
      appendHop()
      
      
      if (isTraversable) {   
        ramp = toCTN.getObject_bytype("ramp")
        if (ramp) {
          //Moves onto aligned stairs within the current plane is blocked (ascending stairs)
          
          if (ramp.ascendDIR == toHEADING) {   
          
            ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, toCTN, toUP, toFORWARD, toUP)
            _isTraversable &= isTraversable
            _isPortaljump |= isPortaljump
            r.toUPRAMP = true
            //appendHop()
            // Here also needs adjusted if intend down-facing-portal on top of stairs
          }
          else {
          //Moves onto mis-aligned stairs within the current plane is blocked (stairs function as walls on their own plane in every other direction)
            _isTraversable = false
            r.toBLOCKINGRAMP = true
          }        
        }
        else {
          fromCTN = toCTN
          fromHEADING = toHEADING   //down
          fromFORWARD = toFORWARD   //down
          fromUP = toUP
          ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, libek.direction.invert[toUP], fromFORWARD, fromUP)
          if (isTraversable) {
            //_isTraversable &= isTraversable
            ramp = toCTN.getObject_bytype("ramp")
            if (ramp) {              
              if (ramp.descendDIR == fromHEADING) {
                _isPortaljump |= isPortaljump
                appendHop()   
                r.toCTN = toCTN
                r.toUP = toUP
                r.toDOWNRAMP = true
              }
              else {
                r.hopOUT = true
              }
            }
            else {
              r.hopOUT = true
            }         
          }
        }
      }
    }
    if (r.fromUPRAMP) {
      ramp = r.toCTN.getObject_bytype("ramp")
      if (ramp) {
        if (ramp.ascendDIR == r.toHEADING) {
          r.toUPRAMP = true
        }
        else {
          _isTraversable = false
          r.toBLOCKINGRAMP = true
        }
      }
      
      else {
        ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, r.toCTN, libek.direction.invert[r.toUP], r.toFORWARD, r.toUP)
        if (isTraversable) {
          ramp = toCTN.getObject_bytype("ramp")
          if (ramp) {
            if (ramp.descendDIR == r.toHEADING) {
              r.toDOWNRAMP = true
              r.toCTN = toCTN
              r.toUP = toUP
              appendHop()
            }
            else {
              r.hopOUT = true
            }
          }
          else {
            r.hopOUT = true
          }
        }
      }
    }
    
    r.isTraversable = function() {
      for (let hop of r.path) {
        if (!zone.isTraversable(hop.fromCTN, hop.fromHEADING, hop.toCTN, hop.toHEADING, obj)) {
          return false
        }
      }
      return true
    }
    r.isPortaljump = _isPortaljump
    //console.log(r)
    return r
  },
  
  scan_upladder:function(zone, loc, obj, forward, up=libek.direction.code.UP) {
  
    let fromCTN = loc
    let fromHEADING = libek.direction.code.UP
    let fromFORWARD = forward
    let fromUP = up
    
    let _isTraversable = true
    let _isPortaljump = false
    
    let adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable, ramp
    
    let r = { 
      OBJ:obj,
      priority:0,
      path:[],      //Used by animation system for handling portals.  Eventually, the movement engine will need this for certain special cases
      fromCTN:loc,
      fromHEADING:fromHEADING,
      fromFORWARD:fromFORWARD,
      fromUP:fromUP
    }
    
    let appendHop = function() {
      r.path.push({
        adjCTN:adjCTN,
        fromCTN:fromCTN,
        fromHEADING:fromHEADING,
        fromFORWARD:fromFORWARD,
        fromUP:fromUP,
        toCTN:toCTN,
        toHEADING:toHEADING,
        toFORWARD:toFORWARD,
        toUP:toUP,
        isTraversable:isTraversable,
        isPortaljump:isPortaljump,
      })  
    }
    
    let downramp_or_flat = true    
    
    //scan upward
    ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
    _isTraversable &= isTraversable
    _isPortaljump |= isPortaljump
    
    r.toCTN = toCTN
    r.toHEADING = toHEADING
    r.toFORWARD = toFORWARD
    r.toUP = toUP
    appendHop()
    
    if (isTraversable) {  
      fromCTN = toCTN
      fromHEADING = toFORWARD
      fromFORWARD = toFORWARD
      fromUP = toUP
      
      //scan forward
      ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
      
      if (isTraversable) {              
        r.toCTN = toCTN
        r.toFORWARD = toHEADING
        r.toFORWARD = toFORWARD
        r.toUP = toUP 
        appendHop()
        
        //ladder terminal with open space above and the space in front is also open and [presumably] can be climbed out onto
        r.isLADDEREXIT = true
      }
      else {
        let ldr = toCTN.getSideobject_bytype(libek.direction.invert[toFORWARD], "ladder")
        if (ldr) {
          // ladder extends to the above space
          r.isLADDER = true
        }
        else {
          // ladder terminal with open space above
          r.isLADDERTERMINAL = true
        }
      }
    }
    else {
      // ladder terminal with obstructed space above
      r.isLADDEROBSTRUCTED = true
    }
    
    r.isTraversable = function() {
      for (let hop of r.path) {
        if (!zone.isTraversable(hop.fromCTN, hop.fromHEADING, hop.toCTN, hop.toHEADING, obj)) {
          return false
        }
      }
      return true
    }
    r.isPortaljump = _isPortaljump
    
    return r
  },
  
  
  scan_downladder:function(zone, loc, obj, forward, up=libek.direction.code.UP) {
  
    let fromCTN = loc
    let fromHEADING = libek.direction.code.DOWN
    let fromFORWARD = forward
    let fromUP = up
    
    let _isTraversable = true
    let _isPortaljump = false
    
    let adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable, ramp
    
    let r = { 
      OBJ:obj,
      priority:0,
      path:[],      //Used by animation system for handling portals.  Eventually, the movement engine will need this for certain special cases
      fromCTN:loc,
      fromHEADING:fromHEADING,
      fromFORWARD:fromFORWARD,
      fromUP:fromUP
    }
    
    let appendHop = function() {
      r.path.push({
        adjCTN:adjCTN,
        fromCTN:fromCTN,
        fromHEADING:fromHEADING,
        fromFORWARD:fromFORWARD,
        fromUP:fromUP,
        toCTN:toCTN,
        toHEADING:toHEADING,
        toFORWARD:toFORWARD,
        toUP:toUP,
        isTraversable:isTraversable,
        isPortaljump:isPortaljump,
      })  
    }
    
    let downramp_or_flat = true    
    
    //scan downward
    ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
    _isTraversable &= isTraversable
    _isPortaljump |= isPortaljump
    
    r.toCTN = toCTN
    r.toHEADING = toHEADING
    r.toFORWARD = toFORWARD
    r.toUP = toUP
    appendHop()
    
    if (isTraversable) {  
      fromCTN = toCTN
      fromHEADING = toFORWARD
      fromFORWARD = toFORWARD
      fromUP = toUP
      
      //scan forward
      ;[adjCTN, toCTN, toHEADING, toFORWARD, toUP, isPortaljump, isTraversable] = zone.getLocalTopology(obj, fromCTN, fromHEADING, fromFORWARD, fromUP)
      
      if (isTraversable) {              
        r.toCTN = toCTN
        r.toFORWARD = toHEADING
        r.toFORWARD = toFORWARD
        r.toUP = toUP 
        appendHop()
        
        //ladder terminal with open space below (also nothing forward from that space... which probably means something pushed a ladder-block away...)
        r.isLADDERTERMINAL = true
      }
      else {
        let ldr = toCTN.getSideobject_bytype(libek.direction.invert[toFORWARD], "ladder")
        if (ldr) {
          // ladder extends to the below space
          r.isLADDER = true
        }
        else {
          // ladder terminal with open space below... ( which also probably means something pushed a ladder-block away... and replaced it with a non-ladder block)
          r.isLADDERTERMINAL = true
        }
      }
    }
    else {
      // ladder terminal with floor below
      r.isLADDERTERMINAL = true
    }
    
    r.isTraversable = function() {
      for (let hop of r.path) {
        if (!zone.isTraversable(hop.fromCTN, hop.fromHEADING, hop.toCTN, hop.toHEADING, obj)) {
          return false
        }
      }
      return true
    }
    r.isPortaljump = _isPortaljump
    
    return r
  }
  
  // Also need a risk-averse topological scan for mouse and moose (like the "ramp" scan, but only includes a down-space if it contains an aligned ramp
  // Should also exclude the "hop-off-end-of-ramp" behavior from Orthot II (inadvertent but technically correct and also inadvertently animated, 
  // then left in-place for fun)
}












