
/*
  Command Sequence Executor

  This manages callbacks that run sequential and continuous code.
  
  In terms of functionality, this loosely parallels the THREE.js animation system, but rather than interpolating object properties between keyframes, 
  this is intended for directly coded manipulations.  
  
  This requirement is instigted partly by the way Orthot III handled portals (A surrogate object is spawned by the animation controller at the portal's destination)
  and partly by the intent to properly support a particularly crude form of animation (Mesh-swap on keyframe)
  
  AND, in pseudo-defense of this:  If I have to go through the trouble of rigging 3D meshes, What I'd really want is an animation system that also realistically 
  simulates joints, springs, and muscles (including realistic responses to inputs when muscles are stressed or in highly contracted states)  
  (arbitrary heirarchies of interpolated transformations are quite flexible, but they also are great for getting ProgrammerArtist to shoot himself in the foot)
  
  init:  function or array of functions to run when CommandSequence.start() is called
  end:   function or array of functions to run when the sequence is completed.
  length:  Length [in time] of the sequence
  tracks:  a list of "tracks"
  
  When running, executor time proceeds from 0 to <length>.  0 is the start time.  <length> is the end time.
            
  Each "track" is an Array containing a complete start-to-end command sequence.  Every track is run concurrently with every other track.
  The track sequence is a set of frames interleaved with breakpoints.
  A frame is a list of callbacks that get triggered every time the CommandSequence.advance() is called.
  One frame is active at a time.  Each time a breakpoint is reached, the next frame is activated.
  Frames are not a guaranteed to be called - if CommandSequence is advanced more from before the beginning of a frame to after its end, the frame will be
  skipped.
  A breakpoint is a command which is run at a specific time.  These are guaranteed to be run (if multiple breakpoints are crossed at once, all of them will 
  run in sequence).  When a breakpoint is reached, the next frame will be activated.  A reached breakpoint is also executed before the activated frame.
  
  Tracks are defined in one of three formats:  
  [ <entry>, <entry>, <entry> ]
  <function>
  If the track is just a single function, then the entire track is interpreted as a single frame containing only said function 
      (no breakpoints, and the function will be called every CommandSequence.advance() )
  If the track is an array, the array is interpreted as an interleaved list of frames and breakpoints
  
  breakpoints are defined in this format:
  { at:<function>, time:<number> }
  
  frame-commands are defined in either of these formats:
  { command:<function> }
  <function>
  
  Commands may also be inserted into the initializer or finalizer command list by adding entries in this format
  { init:<function> }
  { end:<function> }
    
  
  Each callback is called in this manner:  callback( delta, time )
    delta - Numeric value passed to CommandSequence.advance()
    time - Numeric amount of time advanced since CommandSequence.start()
    
  Example CommandSequence usage:
  
  let seq = new libek.CommandSequence(
    init => { console.log("START") },
    end  => { console.log("END") },
    [ (d,t) => { console.log("time:", t, " {") } ],
    [ d => { console.log("  action 1") },
      d => { console.log("  action 2") },
      { at: t => { console.log("  -------") }, time:0.5 },
      d => { console.log( "  action 3") } ],
    d => { console.log("}") },
  )  
  seq.start()  
  for (let i = 0; i < 100; i++) {
    if (!seq.advance(0.11)) break
  }
  
  ADDENDUM:  THREE.js animation may be controlled from a CommandSequence fairly easily - An AnimationMixer.update callback may be used directly as a track,
              as a frame entry, or invoked from a command.
*/
libek.CommandSequence = function(init, end, length, ... tracks) {
  let t = 0
  this.active = false
  this.isCommandSequence = true
  
  let _init = Array.isArray(init) ? init : [init]
  let _end = Array.isArray(end) ? end : [end]
  
  let _tracks = []
  
  for (let track of tracks) {
  
    let _track = {
      frames:[],
      breakpoints:[]
    }
    _tracks.push(_track)
    _track.frame = []
    _track.frames.push(_track.frame)
    
    if (typeof(track) == "function") {
      _track.frame.push(track)
    }    
    else if (Array.isArray(track)) {
      for (let cmd of track) {
        if (typeof(cmd) == "function") {
          _track.frame.push(cmd)
        }
        else if (cmd.command) {
          _track.frame.push(cmd.command)
        }
        else if (cmd.at) {
        
          // If action assigned to a time at or after length, insert the command into the finalizer
          //    (this makes sequences a bit more intuitive to program)
          if (cmd.time >= length) {
            _end.splice(_end.length-1, 0, cmd.at)
          }
          else {
            _track.breakpoints.push(cmd)
          }          
          _track.frame = []
          _track.frames.push(_track.frame)
        }
        else if (cmd.end) {
          _end.push(cmd.end)
        }
        else if (cmd.init) {
          _init.push(cmd)
        }
      }
    }
  }
  
  //console.log(_tracks)
  
  this.start = function() {
    t = 0
    for (let track of _tracks) {
      track.nbrkid = 0
      track.nbrk = track.breakpoints[0]
      track.frame = track.frames[0]
    }
    this.active = true
    for (let cmd of _init) {
      cmd(0,0)
    }
    
    // A zero'th frame is helpful for keeps "per-frame" code out of the initializer
    this.advance(0)
  }
  this.stop = function() {
    if (this.active) {
      for (let cmd of _end) {
        cmd(length-t,length)
      }
    }
    this.active = false
  }
  this.advance = function(amt) {
    if ( (!this.active) || (t >= length) ) {
      return false
    }
    
    t += amt
    if (t >= length) {
      this.stop()
      return false
    }
    
    for (let track of _tracks) {
      if (track.nbrk && track.nbrk.time <= t) {
        track.nbrk.at(amt,t)
        track.nbrkid++
        track.nbrk = track.breakpoints[track.nbrkid]
        track.frame = track.frames[track.nbrkid]
      }      
      for (let cmd of track.frame) {
        cmd(amt, t)
      }
    }
    return this.active
  }
}