import {ratingParser} from './imdb-rating-parser.js?v=20261127';
let parser;self.onmessage=event=>{const {serial,kind,ids,text}=event.data;try{if(kind==='start')parser=ratingParser(ids);const done=kind==='chunk'?parser.push(text):false;self.postMessage({serial,done,rows:kind==='finish'?parser.finish():undefined});}catch{self.postMessage({serial,error:'The IMDb dataset could not be read.'});}};
