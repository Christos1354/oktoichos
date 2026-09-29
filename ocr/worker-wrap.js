// Οκτώηχος: τα αρχεία γλώσσας αποθηκεύονται με κατάληξη .wasm ώστε να σερβίρονται παντού
var _okt_fetch = self.fetch.bind(self);
self.fetch = function (u, o) {
  if (typeof u === "string" && /\.traineddata$/.test(u)) u = u + ".wasm";
  return _okt_fetch(u, o);
};
importScripts("worker.min.js");
