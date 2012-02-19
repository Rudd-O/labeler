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

try {
	if (!Importer.include("../amarokjslib/main.js")) {
		throw "Could not import the Amarok QtScript library - aborting";
	}
} catch (e) {
	Amarok.alert("This script requires that you get the Amarok QtScript library script first\nDetails: " + e);
	Amarok.end();
}
if (!amarokjslib_satisfies_version || !amarokjslib_satisfies_version("0.1.1")) {
	Amarok.alert("Quick labeler needs you to update to the latest version of the Amarok QtScript library");
	Amarok.end();
}
	


/*
to-do
make Delete key delete labels selected
make deletion and addition of labels be deferred until Save
make the labeler gain the feature adding menu entries setting / clearing specific labels on songs
make labels added to songs be represented in the playlist
make labeler search for specific labeled songs in the collection browser / add to playlist / replace playlist
make decorator so as to avoid the try catch everywhere: http://www.sitepoint.com/blogs/2008/11/11/arguments-a-javascript-oddity/
*/

function ManageLabels(filenames) {
	
  try {
	  
	var mgr = new LabelManager();

	labels = mgr.getLabels();
	filenames = uniqueize(filenames);

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
			var labeled = filter( function(x) { return mgr.labeled(x,label); } , fs );
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
		mgr.warmupUrlsLabelsCache(filenames,[filteredit.text]);
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

	exportButton = new QPushButton("&Export selected labels as playlists",actionbuttons);
 	function xExportLabels() {
 		items = listview.selectedItems();
 		for (i in items) {
 			var label = items[i].text(0);
 			var fs = mgr.getTracksLabeledAs(label);
                        fs = filter( function(x) { var z = new QFile(x); return z.exists(); } , fs );
 			var playlisttext = fs.join("\n");
			var path = QDir.homePath() + "/" + label + ".m3u";
			var file = new QFile(path);
			file.open(QIODevice.WriteOnly);
			var arr = new QByteArray(playlisttext);
			file.write(arr);
			file.close();
			Amarok.alert("Track list saved to " + path);
 		}
 	}
	exportButton.clicked.connect(
 		function() { try {
 			answer = Amarok.alert("Save changes to labels before exporting?","questionYesNo");
 			if (answer == 3) { save(); }
 			xExportLabels();
 		} catch (e) { Amarok.alert(e); } }
 	);
 	actionbuttonslayout.addWidget(exportButton,0,0);

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
			catch(e) { Amarok.alert(e + " at line " + e.lineNumber); }
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
