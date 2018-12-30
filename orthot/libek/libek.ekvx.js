/*  Parser for the Eketech Voxel Format (presently only used for puzzles for Orthot)
 *
 *  The Eketech Voxel format uses packed voxels (integer 3d bit x,y,z coordinate triplets compressed to a 16 bit int) and templates (propery lists bound to an 
    integer identifier) to compress data data.  Space is divided into a set of regions, each 32x16x32 units in extent.  Each region specifies an offset and two
    data blcoks.  The first data block is list of objects which are defined solely by coordinate and a template identifier.  The second data block is a list of 
    objects defined by coordinate, a template identifer, and an arbitrary collection of parameters (custom configuration for that object).  All template 
    identifiers are used to index the templates.  Templates and per-object configuration do the same thing (templates only reduce the data storage requirement)
    
    The Eketech Voxel Format also contain additional data which was used for vertex-lighting by Orthot II (but which for now is just parsed over and ignored)
*/

libek.loader.ekvx = {
  load:async function(arg, cb) {
    if (typeof(arg) == "string") {
      cb(new libek.EkvxLoader(await libek.load_to_ArrayBuffer(arg)))
    }
    else {
      cb(new libek.EkvxLoader(arg))
    }
  }
}

libek.EkvxLoader = function (data_ab) {
  let data = new libek.DataReader(new DataView(data_ab), true)
  
  //let ekvx = {ekvx:true, importedSwatches:{}}
  
  let raw_templates = {}
  let raw_objects = []
  
  let VERSION = 5.0;
  let EDIT_VERSION = 5.0;	//Version number to use when writing editor data
  
  let header = data.readString(1024)
  //console.log(header)
  let parts = header.split('-')
  let format_name_1 = parts[0]
  let format_name_2 = parts[1]
  if ( (format_name_1 != "EkeVox") || (format_name_2 != "NativeFormat") ){
    throw new Error(`Failed to parse .ekvx:  Unrecognized format ("${header}")`)
  }
  this.data_version = Number.parseFloat(parts[2])
  let name = parts[3]    
  
	if (this.data_version >= Math.floor(EDIT_VERSION+1.0)) {
    throw new Error(`Failed to parse .ekvx:  Incompatible ekvx data (header="${header}", reader-version=${Math.floor(EDIT_VERSION)})`)
	}	
  
  let num_templates = data.readSInt()
	let editorDataStripped = data.readBool()
  //console.log(num_templates, editorDataStripped)
	for (let i = 0; i < num_templates; i++) {
	  let id = data.readSInt()
	  let tooldata = data.readString()
	  //console.log(id, tooldata)
	  
	  let defaultinfo = "ekvx_import:"+tooldata;
	  let vs = {
	    name:defaultinfo, 
	    mfunc:0, 
	    description:defaultinfo,
	    voxelCode:-1,
	    forcedMode:0,
	    showInEditor:false,
	    data:tooldata,
	    validAlignmentfilter:undefined,
	    saneAlignmentfilter:undefined,
	    isSingleton:false,
	    isColorableModel:false,
	    singlePos:undefined,
	    singletonObjid:-1,	
	    typeFlag:0x1,			  //generic voxel
	    pickFlags:0x1,		  //pick against generic voxels
	    coexistFlags:0x2,		//dont coexist with anything
	    baseSwatch:undefined,
	    vlm:0,
	  }
		if (this.data_version >= 5) {
			vs.vlm = data.readSInt();
		}
		if (!editorDataStripped) {	//If the editor data is in the file, construct the swatch from it
		  vs.name = data.readString()
		  vs.description = data.readString()
		  vs.model = data.readString()
		  vs.mfunc = data.readUByte()
		  vs.forcedMode = data.readUByte()
		  vs.voxelCode = data.readSInt()
		  vs.showInEditor = data.readBool()
		  if (this.data_version >= 2) {
		    vs.typeFlag = data.readSInt()
		    data.readUInt()
		    vs.pickFlags = data.readSInt()
		    data.readUInt()
		    if (this.data_version >= 3) {
		      vs.isSingleton = data.readBool()
		      if (this.data_version >= 4) {
		        vs.isColorableModel = data.readBool()
		        if (data.readBool()) {
		          let naligns = data.readSInt()
		          vs.saneAlignmentFilter = {}
						  for (let j = 0; j < naligns; j++) {
		            let k = data.readSShort()
		            let v = data.readSShort()
		            vs.saneAlignmentFilter[k] = v
		          }
		          
		          naligns = data.readSInt()
		          vs.validAlignmentfilter = {}
						  for (let j = 0; j < naligns; j++) {
		            let k = data.readSShort()
		            let v = data.readSShort()
		            vs.validAlignmentfilter[k] = v
		          }
		        }
		      }
		    }
		  }
		}
	  
	  //console.log(vs)
	  raw_templates[id] = vs
	}
	
	//If lightmap data is present, parse through and ignore it.  For now.
	if (this.data_version >= 5) {
	  if (data.readBool()) {
	    //console.log("lightmap data")
	    let num_colors = data.readSInt()		    
			for (let i = 0; i < num_colors; i++) {
				data.readString()					
			}
	    let num_lmuvs = data.readSInt()		  	
		  for (let i = 0; i < num_lmuvs; i++) {
		    data.readFloat();data.readFloat();
		    data.readFloat();data.readFloat();
		    data.readFloat();data.readFloat();
		    data.readFloat();data.readFloat();
		  }
		  let lmtw = data.readSInt()
		  let lmth = data.readSint()
		  console.log(lmtw, lmth)
		  if (lmtw != -1) {			    
				for (let ci = 0; ci < lmtw * lmth; ci++) {
				  data.readUByte()
				  data.readUByte()
				  data.readUByte()
				  data.readUByte()
				}
		  }
	  }			
	}
	//let sp = new libek.dvol.Space()
	//console.log(sp)
	let num_buckets = data.readSInt()
	//console.log(num_buckets)
	for (let i = 0; i < num_buckets; i++) {
	  let ox = data.readSInt()
	  let oy = data.readSInt()
	  let oz = data.readSInt()
	  
	  //console.log("ofs: ", ox, oy, oz)
	  
	  let num_voxels = data.readSInt()
	  //console.log(num_voxels)
	  for (let j = 0; j < num_voxels; j++) {
	    let binpos = data.readUShort()
	    let typeid = data.readSInt()
	    let x = ((binpos&0x001f)    ) + ox
	    let y = ((binpos&0x07e0)>>5 ) + oy
	    let z = ((binpos&0xf800)>>11) + oz
	    //console.log(x,y,z, "|", binpos)
	    //sp.get(x,y,z).t = typeid
	    raw_objects.push( {x:x,y:y,z:z, type:typeid} )
	    //console.log(ekvx.importedSwatches[typeid])
	  }
	  
	  num_voxels = data.readSInt()
	  //console.log(num_voxels)
	  for (let j = 0; j < num_voxels; j++) {
	    let binpos = data.readUShort()
	    let typeid = data.readSInt()
	    let objdata = data.readString()
	    let x = ((binpos&0x001f)    ) + ox
	    let y = ((binpos&0x07e0)>>5 ) + oy
	    let z = ((binpos&0xf800)>>11) + oz
	    //sp.get(x,y,z).t = typeid
	    raw_objects.push( {x:x,y:y,z:z, type:typeid, data:objdata } )
	    //console.log(specialdata)
	  }
	  
	  // Skip lightmap data... for now.  Maybe will remain skipped.
	  if (this.data_version >= 5) {
	    let numLightEntries = data.readSInt()
	    //console.log(numLightEntries)
			for (let j = 0; j < numLightEntries; j++) {
				let binpos = data.readUShort();
				let colorID = data.readSInt();
			}
			
			numLightEntries = data.readSInt()
	    //console.log(numLightEntries)
			for (let j = 0; j < numLightEntries; j++) {
				let binpos = data.readUShort();
				data.readSInt()
				data.readSInt()
				data.readSInt()
				data.readSInt()
				data.readSInt()
				data.readSInt()
			}
			
		  numLightEntries = data.readSInt();
      //console.log(numLightEntries)
		  for (let j = 0; j < numLightEntries; j++) {
			  let binpos = data.readUShort();
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
			  data.readSInt()
		  }
		}
  }
  //console.log("OBJECT NAME", name)
  //console.log("TEMPLATES", raw_templates)
  //console.log("DATA", raw_objects)
    
  let templates = {}
  
  //  Configure the EKVX interpreter
  //
  //  This function is an for mapping raw data from the voxel editor onto the interpreter's preferred inputs.  It also allows the interpreter to anticipate
  //    what sort of obejcts will be loaded before loading any of them.
  //  The main use of this function is to simplify backwards-compatibility and rectify inconsistancies in editor data generation 
  //    (such as an old version lazilly outputting the same color in two different formats)
  //  
  //  template:  If defined, this callback which transforms a raw template into the input the EKVX interpreter needs to generate the templated object
  //             If not defined, the raw templates are used directly.
  this.loadConfig = function(template) {
    if (template) {
      for (let id in raw_templates) {
        templates[id] = template(id, raw_templates[id])
      }
    }
    else {
      templates = raw_templates
    }
  }
  
  let entries = raw_objects
  let deferred = []
  
  //  Transfer all voxel data to the EKVX interpreter
  //
  //  This sends object position and the template for the object specified during loadConfig().  The interpreter may optionally request that objects be
  //  deferred to a later pass (generally if the interpreter wants to resolve dependencies by loading things in a particular order).  
  //
  //  add:      Callback for transferring one object to the interpreter.  
  //              If the callback returns true, the object is deferred to the next pass (for which add() will be called again with the same data)
  //  endpass:  This is called at the end of each pass.  It indicates how much data will be sent on the next pass.
  this.loadData = function(add, endpass) {
    while (entries.length != 0) {
      for (let obj of entries) {
        if (add(obj.x, obj.y, obj.z, templates[obj.type], obj.data)) {
          deferred.push(obj)
        }
      }
      entries = deferred
      deferred = []
      if (endpass) {
  		  endpass(entries.length)
  		}
    }
    entries = raw_objects
  }
  //return ekvx
}














