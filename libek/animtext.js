export { animtext_Loader, parse_Animtext }
import { fetchText } from './libek.js'


var animtext_Loader = {
  isLibekLoader:true,
  load:async function(arg, cb, fetchOPTS) {
    if (typeof(arg) == "string") {
      cb(parse_Animtext(await fetchText(arg, fetchOPTS)))
    }
    else if (typeof(arg) == "object") {
      if (arg.text) { 
        cb(parse_Animtext(arg.text))
      }
      else if (arg.url) {
        cb(parse_Animtext(await fetchText(arg.url, fetchOPTS)))
      }
    }
  }
}

//The text contains a series of "Blocks".
//Each block is an independent animation
//The blocks are delimited by blank lines.  A blank line is a line which has no non-white-space chars

//Each block is a series of "Segments"
//A segment is a single line containing a command with its parameters, followed by any number of text lines.
//Each line which which starts with something other than a whitespace character is the first line of a segment
//The "texts" portion of the segment is every following indented line up to and excluding the next line which starts with a non-whitespace char

// This was going to be a complex piece of code, then it was determined that it could be mostly implemented with a series of regular expressions
var parse_Animtext = function(txt) {
  //Strip out all comments.  Comments are lines which start with '#'
  txt = txt.split(/\n#[^\n]*/).join('\n')
  
  //Find all block delimiters 
  //  regex searches for a newline, then any amount of whitespace, then another newline which is followed by a non-whitespace character 
  //      (excluding the non-whitepace char from the match)
  let block_parts = txt.split(/\n\s*\n(?=\S)/)
  let blocks = []
  for (let block_part of block_parts) {
  
    //Find all segment delimiters
    //  regex searches for a newline, followed by a non-whitespace character (excluding the non-whitepace char from the match)
    let segment_parts = block_part.split(/\n(?=\S)/)
    let block = {      
      segments:[]
    }
    blocks.push(block)
    for (let segment_part of segment_parts) {
    
      //Finally, the individual lines are split by simple search for newline chars.
      let segment = {
        texts:segment_part.split('\n')
      }
      
      //First line in the segment is the operation to apply.  The rest are texts.
      segment.command = segment.texts.shift()
      block.segments.push(segment)
    }
    
    //Steal the "command" field from the first segment in each block and use it as the block name.
    //  (texts in segment 0 get default handling)
    block.name = block.segments[0].command
    delete block.segments[0].command
  }
  blocks[0].isAnimText = true
  //console.log(blocks)
  return blocks
}














