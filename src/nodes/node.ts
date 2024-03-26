import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import { delay } from "../utils";

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean, 
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void 
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let mynode: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null,
  }

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  node.get("/status", (req, res) => {
    if (isFaulty) {
      
      mynode.x = null;
      mynode.decided = null;
      mynode.k = null;
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });


  node.post("/message", async function(req, res) {
    let { k, x, messageType } = req.body;
  
    if (!isFaulty && !mynode.killed) {
      if (messageType == "propose") {
        if (!proposals.has(k)) {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x); 
        let proposal = proposals.get(k);
        proposal=proposal!;
        if (proposal.length >= (N - F)) {
          let count0 = proposal.filter(function(el) { return el == 0; }).length;
          let count1 = proposal.filter(function(el) { return el == 1; }).length;
  
          // Détermination de la valeur de consensus
          if (count0 > (N / 2)) {
            x = 0;
          } else if (count1 > (N / 2)) {
            x = 1;
          } else {
            x = "?";
          }
  
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ k: k, x: x, messageType: "vote" }),
            });
          }
        }
      }
      else if (messageType == "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x);
        let vote = votes.get(k)!;
  
        if (vote.length >= (N - F)) {
          console.log("vote", vote, "node :", nodeId, "k :", k);
          let count0 = vote.filter(function(el) { return el == 0; }).length;
          let count1 = vote.filter(function(el) { return el == 1; }).length;
  
          if (count0 >= F + 1) {
            mynode.x = 0;
            mynode.decided = true;
          } else if (count1 >= F + 1) {
            mynode.x = 1;
            mynode.decided = true;
          } else {
            if (count0 + count1 > 0 && count0 > count1) {
              mynode.x = 0;
            } else if (count0 + count1 > 0 && count0 < count1) {
              mynode.x = 1;
            } else {
              mynode.x = Math.random() > 0.5 ? 0 : 1;
            }
            mynode.k = k + 1;
  
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ k: mynode.k, x: mynode.x, messageType: "propose" }),
              });
            }
          }
        }
      }
    }
    // Répondre au client
    res.status(200).send("Message received and processed.");
  });
  
  
  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(5);
    }
    if (!isFaulty) {
      mynode.k = 1;
      mynode.x = initialValue;
      mynode.decided = false;
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ k: mynode.k, x: mynode.x, messageType: "propose" }),
        });
      }
    }
    else {
      mynode.decided = null;
      mynode.x = null;
      mynode.k = null;
    }
    res.status(200).send("Consensus algorithm started.");
  });


  node.get("/stop", (req, res) => {
    mynode.killed = true;
    res.status(200).send("killed");
  });

  
  node.get("/getState", (req, res) => {
    res.status(200).send({
      killed: mynode.killed,
      x: mynode.x,
      decided: mynode.decided,
      k: mynode.k,
    });
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    setNodeIsReady(nodeId);
  });

  return server;
}