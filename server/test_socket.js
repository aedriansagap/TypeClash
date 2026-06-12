const { Server } = require("socket.io");
const { createServer } = require("http");

const httpServer = createServer();
const io = new Server(httpServer);

io.on("connection", (socket) => {
  socket.join("room1");
  console.log("Rooms:", socket.rooms);
  try {
    socket.to(undefined).emit("test", "hello");
    console.log("to(undefined) works. Did it broadcast?");
  } catch (e) {
    console.error("Error:", e.message);
  }
});

httpServer.listen(3000, () => {
  const client = require("socket.io-client")("http://localhost:3000");
  client.on("connect", () => {
    client.disconnect();
    httpServer.close();
  });
});
