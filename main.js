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
to- do
make Delete key delete labels selected
make deletion be deferred until Save
make the labeler operate on the currently playing song, when invoked with global shortcut
(label currently playing song command)
make the labeler gain the feature adding menu entries setting / clearing specific labels on songs
make labels added to songs be represented in the playlist
make labeler search for specific labeled songs in the collection browser / add to playlist / replace playlist
*/
function basename(path) {
    return path.replace(/\\/g,'/').replace( /.*\//, '' );
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
function esc(s) { return Amarok.Collection.escape(s); }

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

function LabelManager() {
	this.labels = null;
	this.track_cache = new Array();
	this.label_cache = new Array();
	this.urls_labels_cache = new Array();
}
LabelManager.prototype.warmupFileCache = function(filenames) {
	if (filenames.length == 0) { return; }
	keys = new Array(); for (f in filenames) { keys.push("'." + esc(filenames[f]) + "'"); }
	query = "select id,rpath from urls where rpath in ("+keys.join(",")+")";
	res = q(query);
	if (keys.length * 2 != res.length) {
		throw "Unexpected keys.length != ids.length: " + keys.length + " " + res.length;
	}
	for (i in keys) {
		i = i * 2;
		id = res[i];
		filename = res[i+1].substr(1);
		this.track_cache[filename] = id;
	}
};
LabelManager.prototype.warmupLabelCache = function(labels) {
	if (labels.length == 0) { return; }
	keys = new Array(); for (f in labels) { keys.push("'" + esc(labels[f]) + "'"); }
	query = "select id,label from labels where label in ("+keys.join(",")+")";
	res = q(query);
	if (keys.length * 2 != res.length) {
		throw "Unexpected keys.length != ids.length: " + keys.length + " " + res.length;
	}
	for (i in keys) {
		i = i * 2;
		id = res[i];
		label = res[i+1];
		this.label_cache[label] = id;
	}
};
LabelManager.prototype.warmupUrlsLabelsCache = function(filenames,labels) {
	if (filenames.length == 0) { return; }
	if (labels.length == 0) { return; }
	query = "select CONCAT(url,',',label) from urls_labels";
	res = q(query);
	query = "select label from urls_labels";
	for (i in filenames) {
		urlid = this.getTrackID(filenames[i]);
		for (j in labels) {
			labelid = this.getLabelID(labels[j]);
			this.urls_labels_cache[urlid+ "," + labelid] = false;
		}
	}
	for (i in res) {
		this.urls_labels_cache[res[i]] = true;
	}
};
LabelManager.prototype.getLabels = function() {
	if (this.labels === null) { this.labels = q("select label from labels"); }
	return this.labels;
};
LabelManager.prototype.getTrackID = function(filename) {
	if (!this.track_cache[filename]) {
		Amarok.debug("Initializing track cache for "+filename);
		query = "select id from urls where rpath = '" + esc("." + filename) + "'";
		id = q(query)[0];
		if (!id) { throw filename + ' does not have an associated track ID'; }
		this.track_cache[filename] = id;
		return id;
	}
	return this.track_cache[filename];
};
LabelManager.prototype.getLabelID = function (label) {
	if (!this.label_cache[label]) {
		Amarok.debug("Initializing label cache for "+label);
		query = "select id from labels where label = '" + esc(label) + "'";
		id = q(query)[0];
		if (!id) { throw label + ' does not have an associated label ID'; }
		this.label_cache[label] = id;
		return id;
	}
	return this.label_cache[label];
};
LabelManager.prototype.labeled = function(filename,label) {
	urlid = this.getTrackID(filename);
	labelid = this.getLabelID(label);
	if (this.urls_labels_cache[urlid+ "," + labelid] === undefined) {
		query = "select label from urls_labels where url = " + urlid + " and label = " + labelid;
		id = q(query)[0];
		if (id) { id = true; }
		else { id = false };
		this.urls_labels_cache[urlid + "," + labelid] = id;
		return id;
	}
	return this.urls_labels_cache[urlid + "," + labelid];
};
LabelManager.prototype.addLabel = function (filename,label) {
	if (this.labeled(filename,label)) { return; }
	Amarok.debug("Adding label " + label + " to file " + filename);
	q("insert into urls_labels (url,label) values("+this.getTrackID(filename)+","+this.getLabelID(label)+")");
	this.urls_labels_cache[this.getTrackID(filename) + "," + this.getLabelID(label)] = true;
};
LabelManager.prototype.removeLabel = function (filename,label) {
	if (!this.labeled(filename,label)) { return; }
	Amarok.debug("Removing label " + label + " from file " + filename);
	q("delete from urls_labels where url = "+this.getTrackID(filename)+" and label = "+this.getLabelID(label));
	this.urls_labels_cache[this.getTrackID(filename) + "," + this.getLabelID(label)] = false;
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
			q("insert into labels (label) values('" + esc(label) + "')");
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
};

var settings = new QSettings( "DragonFear", "labeler" );

function ManageLabels(filenames) {
	
  try {
	  
	var mgr = new LabelManager();

	labels = mgr.getLabels();

	mgr.warmupFileCache(filenames);
	mgr.warmupLabelCache(labels);
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
	
	function addLabelItem(label) {
		labelitem = new QTreeWidgetItem(listview);
		labelitem.setText(0,label);
		labelitem.setFlags (Qt.ItemFlags(Qt.ItemIsTristate | Qt.ItemIsEnabled | Qt.ItemIsUserCheckable | Qt.ItemIsSelectable ));
		labelitem.setCheckState(0,Qt.Unchecked);
		listview.addTopLevelItem(labelitem);
		return labelitem;
	}
	
	for (i in labels) {
		Amarok.debug("Constructing " + labels[i]);
		labelitem = addLabelItem(labels[i]);
		if (filenames.length < 50 && filenames.length > 1) {
			for (j in filenames) {
				fileitem = new QTreeWidgetItem(labelitem);
				fileitem.setText(0,basename(filenames[j]));
				fileitem.setText(1,filenames[j]);
				fileitem.setFlags (Qt.ItemFlags(Qt.ItemIsEnabled | Qt.ItemIsUserCheckable | Qt.ItemIsSelectable ));
				if (mgr.labeled(filenames[j],labels[i])) { fileitem.setCheckState(0,Qt.Checked); }
				else { fileitem.setCheckState(0,Qt.Unchecked); }
				labelitem.addChild(fileitem);
			}
		}
		else {
			z = 0;
			for (j in filenames) {
				if (mgr.labeled(filenames[j],labels[i])) { z = z + 1; }
			}
			if (z == filenames.length) { labelitem.setCheckState(0,Qt.Checked); }
			else if (z > 0) { labelitem.setCheckState(0,Qt.PartiallyChecked); }
			else { labelitem.setCheckState(0,Qt.Unchecked); }
		}
	}

	var filterlabel=new QLabel("Filter:",filteraddbox);
	filteraddboxlayout.addWidget(filterlabel,0,0);
	
	var filteredit=new QLineEdit(filteraddbox);
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
	function xCreateLabel(text) {
		if (!text) { throw "Please input a label name"; }
		mgr.createLabel(text);
		labelitem = addLabelItem(text);
		labelitem.setSelected(true);
		labelitem.setCheckState(0,Qt.Checked);
	}
	filteredit.returnPressed.connect(
		function () {
			try {
				if (filteredit.text) {
					items = listview.findItems(filteredit.text,Qt.MatchContains,0);
					if (items.length == 0) {
						xCreateLabel(filteredit.text);
						filteredit.setText("");
					}
					else if (items.length == 1) {
						items[0].setCheckState(0,Qt.Checked);
						filteredit.setText("");
					}
					else {
						xCreateLabel(filteredit.text);
						filteredit.setText("");
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
				createLabelAndClearInput(filteredit.text);
				filteredit.setText("");
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
			Amarok.debug("Sweeping " + label);
			if (labelitem.childCount > 0) {
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
					for (i in filenames) { mgr.addLabel(filenames[i],label); }
				}
				else if (labelitem.checkState(0) == Qt.PartiallyChecked) {
				}
				else {
					for (i in filenames) { mgr.removeLabel(filenames[i],label); }
				}
			}
		}
	}

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
	
	removeButton = new QPushButton("&Delete label",buttonBox);
	function xRemoveSelectedItems() {
		items = listview.selectedItems();
		for (i in items) {
			label = items[i].text(0);
			id = mgr.getLabelID(label);
			mgr.deleteLabel(label);
			listview.invisibleRootItem().removeChild(items[i])
		}
	}
	removeButton.clicked.connect(
		function() { try { xRemoveSelectedItems(); } catch (e) { Amarok.alert(e); } }
	);

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
	Amarok.alert(e);
  }
}


function ManageLabelsOnSelectedTracks() {
	filenames = Amarok.Playlist.selectedFilenames();
	if (filenames.length > 0) { return ManageLabels(filenames); }
	else { Amarok.alert("Please select at least one track"); }
}

function ManageLabelsOnPlayingTrack() {
	currentTrack = Amarok.Engine.currentTrack();
	Amarok.debug(currentTrack.path);
	if (currentTrack.path) { return ManageLabels([currentTrack.path]); }
	else { Amarok.alert("Please start playback"); }
}

Amarok.Window.addToolsSeparator();
Amarok.Window.addToolsMenu( "ManageLabelsOnSelectedTracks", "Manage labels of selected tracks", "folder" );
Amarok.Window.addToolsMenu( "ManageLabelsOnPlayingTrack", "Manage labels of playing track", "folder" );
Amarok.Window.ToolsMenu.ManageLabelsOnSelectedTracks['triggered()'].connect(ManageLabelsOnSelectedTracks);
Amarok.Window.ToolsMenu.ManageLabelsOnPlayingTrack['triggered()'].connect(ManageLabelsOnPlayingTrack);
