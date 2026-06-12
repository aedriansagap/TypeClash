const { Server } = require("socket.io");
const io = new Server();
console.log("io.sockets.sockets exists?", !!io.sockets.sockets);
console.log("io.sockets.sockets is Map?", io.sockets.sockets instanceof Map);
console.log("io.sockets.sockets type:", typeof io.sockets.sockets);
