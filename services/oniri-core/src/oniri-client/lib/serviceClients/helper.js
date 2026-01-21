const rinfo2buffer = (rinfo) => {
  let ip = rinfo.address.split("."),
    buf = Buffer.alloc(6);
  buf.writeUInt8(parseInt(ip[0]), 0);
  buf.writeUInt8(parseInt(ip[1]), 1);
  buf.writeUInt8(parseInt(ip[2]), 2);
  buf.writeUInt8(parseInt(ip[3]), 3);
  buf.writeUInt16BE(parseInt(rinfo.port), 4);
  return buf;
};

const buffer2rinfo = (buf) => {
  return {
    address: `${buf.readUInt8(0)}.${buf.readUInt8(1)}.${buf.readUInt8(
      2
    )}.${buf.readUInt8(3)}`,
    port: buf.readUInt16BE(4),
  };
};

const buffer2Msg = (buf) => {
  return buf.slice(6);
};

const createNewMesssage = (msg, rinfo) => {
  let rinfo_buf = rinfo2buffer(rinfo);
  const new_msg = Buffer.concat(
    [rinfo_buf, msg],
    rinfo_buf.length + msg.length
  );
  return new_msg;
};

const retriveMessage = (buf) => {
  return {
    client_rinfo: buffer2rinfo(buf),
    client_rinfo_buf: buf.slice(0, 6),
    client_msg: buffer2Msg(buf),
  };
};

export {
  rinfo2buffer,
  buffer2rinfo,
  createNewMesssage,
  retriveMessage,
};
