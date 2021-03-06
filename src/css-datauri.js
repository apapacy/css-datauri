import {dirname, resolve, extname, relative} from 'path';
import fs from 'fs';
import parseCSS from 'css-parse';
import stringifyCSS from 'css-stringify';
import DataURI from 'datauri';
import { sync as datauriSync } from 'datauri';
import multimatch from 'multimatch';
import mkdirp from 'mkdirp';
import EventEmitter from 'events';

const PATTERN = /url\s*\(['"]*([^\'"]+)['"]*\)/gmi;

const GET_FILE = (url, base) => url && relative(process.cwd(), resolve(base, url.split("?")[0].split("#")[0]));

export default class CSSDataURI extends EventEmitter {
  
  constructor(options = {}) {
  	super();
  	this.options = Object.assign({
  		filter: ['**/*'],
  		base: 'auto'
  	}, options);
  }

  _encodeAssets(data, base = '.', callback) {
  	
  	let match;
  	let assets = {};
  	let matches = [];
  	let options = this.options;
  	
  	// Get asset directory
  	base = options.base !== 'auto' && options.base || base;
  	base = fs.lstatSync(base).isDirectory() ? base : dirname(base);
  	
  	var count = 0;
  	
  	// Collect pattern matches
  	while (match = PATTERN.exec(data)) {
  		matches.push(match);
    }
    let filter = typeof options.filter === 'string' ? options.filter.split(/\s*,\s*/) : options.filter;
    
  	// Filter assets
  	matches.forEach( (match) => {
  		var
			url = match[1],
			file = GET_FILE(url, base);
		if ( !assets[url] && multimatch( [file], filter ).length ) {
			assets[url] = {
				file: file
			};
		}
	});
	
  	// Load assets
	Object.keys(assets).forEach( (url) => {
		let asset = assets[url];
		if (callback) {
			(new DataURI()).encode(asset.file, (err, content) => {
				asset.data = content;
				count++;
				if (err && !asset.error) {
					asset.error = err;
				}
				if (count === Object.keys(assets).length) {
					// Complete
					callback && callback(asset.error, assets);
				}
			});
		} else {
			asset.data = datauriSync(asset.file);
		}
	});
	
	// Immediately execute callback if no assets have been found
	if (!Object.keys(assets).length) {
		callback && callback(null, {});
	}
	
	// In sync mode, immediately return result
  	if (!callback) {
  		return assets;
  	}
  }
  
  _encodeData(data, base = '.', callback) {
  	let replace = (data, assets) => {
	  	return data.replace(PATTERN, (matched, url, index) => {
			return assets[url] && `url(${assets[url].data})` || matched;
		});
	};
  	let assets = this._encodeAssets(data, base, callback ? (err, assets) => {
  		var content = replace(data, assets);
  		callback(err, content);
  	} : undefined);
	return assets ? replace(data, assets) : null;
  }
  
  _handleComplete(err, content, callback) {
  	  callback && callback(err, content); 
	  err ? this.emit('error', err) : this.emit('success', content);
	  this.emit('complete', err, content);
  }
  
  encode(src, dest, callback = () => {}) {
	fs.readFile(src, "utf8", (err, data) => {
		if (err) {
			this._handleComplete(err, null, callback);
			return;
		}
  		this._encodeData(data, src, (err, content) => {
			if (err) {
				this._handleComplete(err, null, callback);
				return;
			}
			mkdirp.sync(dirname(dest));
			fs.writeFile(dest, content, "utf-8", (err) => {
			  this._handleComplete(err, content, callback);
			});
		});
  	});
  	return this;
  }
  
  encodeSync(src, dest) {
  	let data = fs.readFileSync(src, "utf8");
  	let content = null;
   	if (data) {
   		content = this._encodeData(data, src);
   		if (content) {
   			mkdirp.sync(dirname(dest));
   			fs.writeFileSync(dest, content, "utf-8");
   		}
   	}
   	this._handleComplete(!content && new Error('An error occurred when encoding'), content);
   	return null;
  }
  
  static promise(src, dest, options) {
    return new Promise((resolve, reject) => {
      (new CSSDataURI(options))
        .on('error', reject)
        .on('success', resolve)
        .encode(src, dest)
    });
  }

  static sync(src, dest, options) {
    let content = (new CSSDataURI(options)).encodeSync(src, dest);
    return content;
  }
  
  static encode(src, dest, callback, options) {
    (new CSSDataURI(options)).encode(src, dest, callback);
  }
  
}