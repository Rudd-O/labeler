/*#########################################################################
#   This program is free software; you can redistribute it and/or modify  #
#   it under the terms of the GNU General Public License as published by  #
#   the Free Software Foundation; either version 3 of the License, or     #
#   (at your option) any later version.                                   #
#                                                                         #
#   This program is distributed in the hope that it will be useful,       #
#   but WITHOUT ANY WARRANTY; without even the implied warranty of        #
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the         #
#   GNU General Public License for more details.                          #
#                                                                         #
#   You should have received a copy of the GNU General Public License     #
#   along with this program; if not, see <http://www.gnu.org/licenses/>   #
#   or write to the                                                       #
#   Free Software Foundation, Inc.,                                       #
#   51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.         #
##########################################################################*/
Importer.loadQtBinding( "qt.core" );
Importer.loadQtBinding( "qt.gui" );

/*
to-do
make Delete key delete labels selected
make deletion and addition of labels be deferred until Save
make the labeler gain the feature adding menu entries setting / clearing specific labels on songs
make labels added to songs be represented in the playlist
make labeler search for specific labeled songs in the collection browser / add to playlist / replace playlist
make labeler generate m3u playlists
make decorator so as to avoid the try catch everywhere: http://www.sitepoint.com/blogs/2008/11/11/arguments-a-javascript-oddity/
*/

function basename(path) {
    return path.replace(/\\/g,'/').replace( /.*\//, '' );
}

function dirname(path) {
    return path.replace(/\\/g,'/').replace(/\/[^\/]*$/, '');
}

function inArray (arr,value) {
	var i;
	for (i=0; i < arr.length; i++) { if (arr[i] == value) { return true; } }
	return false;
}

function q(s) {
	Amarok.debug("SQL query: " + s);
	return Amarok.Collection.query(s);
} 

function path2rpath(p) { return "." + p; }

function rpath2path(p) { return p.substr(1); }

function esc(s) { return Amarok.Collection.escape(s); }

function quotestr(s) { return "'" + Amarok.Collection.escape(s) + "'"; }

function map(func, array) {
	var r = new Array();
	var l = array.length;
	for ( var i = 0; i < l ; i++ ) { r.push(func(array[i])); }
	return r;
}

function filter(func, array) {
	var r = new Array();
	var l = array.length;
	for ( var i = 0; i < l ; i++ ) {
		if (func(array[i])) { r.push(array[i]); }
	}
	return r;
}

function batch(array,batchSize) {
	var result = new Array();
	var l = array.length;
	for (var i = 0; i < l; i++) {
		var stride = Math.floor(i / batchSize);
		if (result[stride] === undefined) { result[stride] = new Array(); }
		result[stride].push(array[i]);
	}
	return result;
}

function AlreadyExists(msg) {
	this.msg = msg;
}
AlreadyExists.prototype.toString = function () {
	return this.msg;
};
function DoesntExist(msg) {
	this.msg = msg;
}
DoesntExist.prototype.toString = function () {
	return this.msg;
};

/* FIXME:
 * invalidate caches if something in collection has been detected to change!
 * invalidate caches if ANOTHER labelmanager has made modifications too
 * perhaps the way to deal with this is to have a shared global cache
 * also if we are going to do that, we might bother to make signals and slots
 * so when labels are modified, consumer UIs are updated
 */
function LabelManager() {
	this.revalidate_track_cache();
	this.revalidate_label_cache();
	this.revalidate_urls_labels_cache();
}
LabelManager.prototype.revalidate_track_cache =       function() {
	sum = q("select md5(group_concat(rpath)) from urls")[0];
	if (!(sum == LabelManager.track_cache_sum)) {
		Amarok.debug("Previous track cache is invalid.  Regenerating. " + LabelManager.track_cache_sum + " " + sum)
		LabelManager.track_cache = new Array();
		LabelManager.track_cache_sum = sum;
	}
}
LabelManager.prototype.revalidate_label_cache =       function() {
	sum = q("select md5(group_concat(label)) from labels")[0];
	if (!(sum == LabelManager.label_cache_sum)) {
		Amarok.debug("Previous label cache is invalid.  Regenerating. " + LabelManager.label_cache_sum + " " + sum)
		LabelManager.label_cache = new Array();
		LabelManager.label_cache_sum = sum;
	}
}
LabelManager.prototype.revalidate_urls_labels_cache = function() {
	sum = q("select md5(group_concat(concat(url,label))) from urls_labels")[0];
	if (!(sum == LabelManager.urls_labels_cache_sum)) {
		Amarok.debug("Previous urls_labels cache is invalid.  Regenerating. " + LabelManager.urls_labels_cache_sum + " " + sum)
		LabelManager.urls_labels_cache = new Array();
		LabelManager.urls_labels_cache_sum = sum;
	}
}
LabelManager.prototype.warmupFileCache = function(filenames) {
	function incache(f) { return LabelManager.track_cache[f] === undefined; }
	var keys = map( function(f) { return quotestr(path2rpath(f)); } , filter( incache, filenames ) );
	if (keys.length == 0) { return; }
	var query = "select id,rpath from urls where rpath in ("+keys.join(",")+")";
	var res = batch(q(query),2);
	if (keys.length != res.length) {
		throw "Unexpected keys.length != res.length: " + keys.length + " " + res.length;
	}
	for (var i in res) { LabelManager.track_cache[rpath2path(res[i][1])] = res[i][0]; }
};
LabelManager.prototype.warmupLabelCache = function(labels) {
	function incache(f) { return LabelManager.label_cache[f] === undefined; }
	var keys = map( quotestr, filter( incache, labels ) );
	if (keys.length == 0) { return; }
	var query = "select id,label from labels where label in ("+keys.join(",")+")";
	var res = batch(q(query),2);
	if (keys.length != res.length) {
		throw "Unexpected keys.length != res.length: " + keys.length + " " + res.length;
	}
	for (var i in res) { LabelManager.label_cache[res[i][1]] = res[i][0]; }
};
LabelManager.prototype.warmupUrlsLabelsCache = function(filenames,labels) {
	if (filenames.length == 0) { return; }
	if (labels.length == 0) { return; }
	for (var i in filenames) {
		var urlid = this.getTrackID(filenames[i]);
		for (var j in labels) {
			var labelid = this.getLabelID(labels[j]);
			if (LabelManager.urls_labels_cache[urlid+ "," + labelid] === undefined) {
				LabelManager.urls_labels_cache[urlid+ "," + labelid] = false;
			}
		}
	}
	var keys = q("select CONCAT(url,',',label) from urls_labels");
	map( function(key) { LabelManager.urls_labels_cache[key] = true; } , keys );
};
LabelManager.prototype.getLabels = function() {
	return q("select label from labels");
};
LabelManager.prototype.getTrackID = function(filename) {
	if (!LabelManager.track_cache[filename]) {
		Amarok.debug("Initializing track cache for "+filename);
		query = "select id from urls where rpath = " + quotestr(path2rpath(filename));
		id = q(query)[0];
		if (!id) { throw filename + ' does not have an associated track ID'; }
		LabelManager.track_cache[filename] = id;
		return id;
	}
	return LabelManager.track_cache[filename];
};
LabelManager.prototype.getLabelID = function (label) {
	if (!LabelManager.label_cache[label]) {
		Amarok.debug("Initializing label cache for "+label);
		query = "select id from labels where label = " + quotestr(label);
		id = q(query)[0];
		if (!id) { throw label + ' does not have an associated label ID'; }
		LabelManager.label_cache[label] = id;
		return id;
	}
	return LabelManager.label_cache[label];
};
LabelManager.prototype.labeled = function(filename,label) {
	urlid = this.getTrackID(filename);
	labelid = this.getLabelID(label);
	if (LabelManager.urls_labels_cache[urlid+ "," + labelid] === undefined) {
		Amarok.debug("Initializing urls_labels cache for " + urlid + "," + labelid);
		query = "select label from urls_labels where url = " + urlid + " and label = " + labelid;
		id = q(query)[0];
		if (id) { id = true; }
		else { id = false };
		LabelManager.urls_labels_cache[urlid + "," + labelid] = id;
		return id;
	}
	return LabelManager.urls_labels_cache[urlid + "," + labelid];
};
LabelManager.prototype.addLabel = function (filename,label) {
	if (this.labeled(filename,label)) { return; }
	Amarok.debug("Adding label " + label + " to file " + filename);
	q("insert into urls_labels (url,label) values("+this.getTrackID(filename)+","+this.getLabelID(label)+")");
	LabelManager.urls_labels_cache[this.getTrackID(filename) + "," + this.getLabelID(label)] = true;
};
LabelManager.prototype.removeLabel = function (filename,label) {
	if (!this.labeled(filename,label)) { return; }
	Amarok.debug("Removing label " + label + " from file " + filename);
	q("delete from urls_labels where url = "+this.getTrackID(filename)+" and label = "+this.getLabelID(label));
	LabelManager.urls_labels_cache[this.getTrackID(filename) + "," + this.getLabelID(label)] = false;
};
LabelManager.prototype.createLabel = function (label) {
	try {
		this.getLabelID(label);
		Amarok.debug("Throwing alreadyexists");
		throw new AlreadyExists("Label " + label + " already exists");
	} catch (e) {
		if (e instanceof AlreadyExists) { throw e; }
		else {
			Amarok.debug("Creating label " + label);
			q("insert into labels (label) values(" + quotestr(label) + ")");
			this.revalidate_label_cache();
			this.revalidate_urls_labels_cache();
		}
	}
};
LabelManager.prototype.deleteLabel = function (label) {
	try {
		labelid = this.getLabelID(label);
	} catch (e) {
		throw new DoesntExist("Label " + label + " doesn't exist");
	}
	Amarok.debug("Deleting label " + label);
	q("delete from urls_labels where label = " + labelid);
	q("delete from labels where id = " + labelid);
	this.revalidate_label_cache();
	this.revalidate_urls_labels_cache();
};
LabelManager.prototype.getTracksLabeledAs = function (label) {
	labelid = this.getLabelID(label);
	res = q("select urls.rpath from urls_labels inner join urls on (urls_labels.url = urls.id) where label = " + labelid);
	return map( rpath2path , res );
}

var settings = new QSettings( "DragonFear", "labeler" );

function ManageLabels(filenames) {
	
  try {
	  
	var mgr = new LabelManager();

	labels = mgr.getLabels();

	mgr.warmupLabelCache(labels);
	mgr.warmupFileCache(filenames);
	mgr.warmupUrlsLabelsCache(filenames,labels);

	var dialog=new QDialog(this);
	if (filenames.length == 1) {
		dialog.setWindowTitle("Labels on " + basename(filenames[0]));
	}
	else {
		dialog.setWindowTitle("Labels on " + filenames.length + " tracks");
	}
	var layout=new QVBoxLayout(dialog);
	dialog.setLayout(layout);
	dialog.size= new QSize(
		parseInt(Amarok.Script.readConfig("labeler.window.width","500")), parseInt(Amarok.Script.readConfig("labeler.window.height","600"))
	);

	var filteraddbox=new QWidget(dialog);
	var filteraddboxlayout=new QHBoxLayout(layout);
	filteraddbox.setLayout(filteraddboxlayout);
	layout.addWidget(filteraddbox,0,0);

	var listview=new QTreeWidget(layout);
	listview.setFrameStyle(QFrame.Sunken | QFrame.Panel);
	listview.setHeaderLabel("Label");
	layout.addWidget(listview,0,0);
	
	function addLabelItem(label,fs) {
		labelitem = new QTreeWidgetItem(listview);
		labelitem.setText(0,label);
		labelitem.setFlags (Qt.ItemFlags(Qt.ItemIsTristate | Qt.ItemIsEnabled | Qt.ItemIsUserCheckable | Qt.ItemIsSelectable ));
		labelitem.setCheckState(0,Qt.Unchecked);
		listview.addTopLevelItem(labelitem);
		if (fs.length < 50 && fs.length > 1) {
			map( function(f) {
				fileitem = new QTreeWidgetItem(labelitem);
				fileitem.setText(0,basename(f));
				fileitem.setText(1,f);
				fileitem.setFlags (Qt.ItemFlags(Qt.ItemIsEnabled | Qt.ItemIsUserCheckable | Qt.ItemIsSelectable ));
				if (mgr.labeled(f,label)) { fileitem.setCheckState(0,Qt.Checked); }
				else { fileitem.setCheckState(0,Qt.Unchecked); }
				labelitem.addChild(fileitem);
			} , fs );
		}
		else {
			labeled = filter( function(x) { return mgr.labeled(x,label); } , fs );
			if (labeled.length == fs.length) { labelitem.setCheckState(0,Qt.Checked); }
			else if (labeled.length > 0) { labelitem.setCheckState(0,Qt.PartiallyChecked); }
			else { labelitem.setCheckState(0,Qt.Unchecked); }
		}
		return labelitem;
	}
	
	map( function(l) { return addLabelItem(l,filenames); } , labels );

	var filterlabel=new QLabel("Filter:",filteraddbox);
	filteraddboxlayout.addWidget(filterlabel,0,0);
	
	var filteredit=new QLineEdit(filteraddbox);
	
	function createLabelAndClearInput() {
		if (!filteredit.text) { throw "Please input a label name"; }
		mgr.createLabel(filteredit.text);
		labelitem = addLabelItem(filteredit.text,filenames);
		labelitem.setSelected(true);
		labelitem.setCheckState(0,Qt.Checked);
		filteredit.setText("");
	}
	function deleteSelectedLabels() {
		items = listview.selectedItems();
		if (items.length == 0) { throw "Please select at least one label"; }
		map ( function(item) {
			label = item.text(0);
			id = mgr.getLabelID(label);
			mgr.deleteLabel(label);
			listview.invisibleRootItem().removeChild(item)
			} , items );
	}
	
	filteredit.placeholderText = "Search or add new label";
	filteredit.textChanged.connect(
		function (newtext) {
			if (newtext == '') {
				for (n = 0; n < listview.invisibleRootItem().childCount(); n++) {
					listview.invisibleRootItem().child(n).setHidden(false);
				}
			} else {
				found = listview.findItems(newtext,Qt.MatchContains,0);
				for (n = 0; n < listview.invisibleRootItem().childCount(); n++) {
					wasfound = inArray(found,listview.invisibleRootItem().child(n));
					listview.invisibleRootItem().child(n).setHidden(!wasfound);
				}
			}
		}
	);
	filteredit.returnPressed.connect(
		function () {
			try {
				if (filteredit.text) {
					items = listview.findItems(filteredit.text,Qt.MatchContains,0);
					if (items.length == 1) {
						items[0].setCheckState(0,Qt.Checked);
						filteredit.setText("");
					}
					else {
						createLabelAndClearInput();
					}
				}
				else {
					dialog.accept();
				}
			} catch (e) {
				Amarok.alert(e);
			}
		}
	);
	filteraddboxlayout.addWidget(filteredit,1,0);
	filteredit.setFocus(true);
	
	var addbutton = new QPushButton("&Add",filteraddbox);
	addbutton.clicked.connect(
		function () {
			try {
				createLabelAndClearInput();
			} catch (e) {
				Amarok.alert(e);
			}
		}
	);
	filteraddboxlayout.addWidget(addbutton,0,0);
	
	function save() {
		for (n = 0; n < listview.invisibleRootItem().childCount(); n++) {
			labelitem = listview.invisibleRootItem().child(n);
			label = labelitem.text(0);
			if (labelitem.childCount() > 0) {
				for (j = 0; j < labelitem.childCount(); j++) {
					fileitem = labelitem.child(j);
					filename = fileitem.text(1);
					if (fileitem.checkState(0) == Qt.Checked) {
						mgr.addLabel(filename,label);
					}
					else if (fileitem.checkState(0) == Qt.Unchecked) {
						mgr.removeLabel(filename,label);
					}
				}
			}
			else {
				if (labelitem.checkState(0) == Qt.Checked) {
					map ( function(f) { mgr.addLabel(f,label); } , filenames );
				}
				else if (labelitem.checkState(0) == Qt.PartiallyChecked) {
				}
				else {
					map ( function(f) { mgr.removeLabel(f,label); } , filenames );
				}
			}
		}
	}

	var actionbuttons=new QWidget(dialog);
	var actionbuttonslayout=new QHBoxLayout(layout);
	actionbuttons.setLayout(actionbuttonslayout);
	layout.addWidget(actionbuttons,0,0);

	removeButton = new QPushButton("&Delete selected labels immediately",actionbuttons);
	removeButton.clicked.connect(
		function() {
			try { deleteSelectedLabels(); }
			catch (e) { Amarok.alert(e); }
		}
	);
	actionbuttonslayout.addWidget(removeButton,0,0);

// 	exportButton = new QPushButton("&Export selected labels as playlists",actionbuttons);
// 	function xExportLabels() {
// 		items = listview.selectedItems();
// 		for (i in items) {
// 			label = items[i].text(0);
// 			fs = mgr.getTracksLabeledAs(label);
// 			Amarok.alert(fs.join("\n"));
// 		}
// 	}
// 	exportButton.clicked.connect(
// 		function() { try {
// 			answer = Amarok.alert("Save changes to labels before exporting?","questionYesNo");
// 			if (answer == 3) { save(); }
// 			xExportLabels();
// 		} catch (e) { Amarok.alert(e); } }
// 	);
// 	actionbuttonslayout.addWidget(exportButton,0,0);

	buttonBox = new QDialogButtonBox(QDialogButtonBox.StandardButtons(QDialogButtonBox.Save|QDialogButtonBox.Discard),Qt.Horizontal,layout);
	layout.addWidget(buttonBox,0,0);
	
	buttonBox.button(QDialogButtonBox.Save).clicked.connect(
		function () {
			try{
				if (!filteredit.focus) { dialog.accept(); }
			} catch(e) {
				Amarok.alert(e);
			}
		}
	);
	buttonBox.button(QDialogButtonBox.Discard).clicked.connect( dialog.reject );
	
	helpButton = new QPushButton("&Help",buttonBox);
	function help() {
		readme = Amarok.Info.scriptPath() + "/README";
		QProcess.startDetached("xdg-open", [readme]);
	}
	helpButton.clicked.connect(help);

	dialog.accepted.connect(
		function() {
			try {
				save();
			}
			catch(e) { Amarok.alert(e); }
		}
	);
	dialog.finished.connect(
		function() {
			try {
				Amarok.Script.writeConfig("labeler.window.width",dialog.size.width()+'');
				Amarok.Script.writeConfig("labeler.window.height",dialog.size.height()+'');
			}
			catch(e) { Amarok.alert(e); }
		}
	);
	dialog.show();
	  
  } catch(e) {
	Amarok.alert("Unexpected exception: " + e + ". Check the debug log for info.");
	map(Amarok.debug,e);
  }
}


function ManageLabelsOnSelectedTracks() {
	filenames = Amarok.Playlist.selectedFilenames();
	if (filenames.length > 0) { return ManageLabels(filenames); }
	else { Amarok.alert("Please select at least one track"); }
}

function ManageLabelsOnPlayingTrack() {
	currentTrack = Amarok.Engine.currentTrack();
	if (currentTrack.path) { return ManageLabels([currentTrack.path]); }
	else { Amarok.alert("Please start playback"); }
}

Amarok.Window.addToolsSeparator();
Amarok.Window.addToolsMenu( "ManageLabelsOnSelectedTracks", "Manage labels on selected tracks", "folder" );
Amarok.Window.addToolsMenu( "ManageLabelsOnPlayingTrack", "Manage labels on playing track", "folder" );
Amarok.Window.ToolsMenu.ManageLabelsOnSelectedTracks['triggered()'].connect(ManageLabelsOnSelectedTracks);
Amarok.Window.ToolsMenu.ManageLabelsOnPlayingTrack['triggered()'].connect(ManageLabelsOnPlayingTrack);
