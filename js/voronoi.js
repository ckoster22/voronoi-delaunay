
var Voronoi = (function () {
	"use strict";
	
	/**
	 * Voronoi diagram.
	 * @param {CanvasRenderingContext2D} ctx - the drawing context
	 * @param {Integer} width
	 * @param {Integer} height
	 * @param {Object} settings
	 */
	function Voronoi(ctx, width, height, settings) {
		this.ctx = ctx;
		this.width = width;
		this.height = height;
		this.settings = settings;
		
		// Generate the seeds
		switch (settings.scattering) {
			case 'random':
				this.seeds = Scatter.random(width, height, settings.seedCount);
				break;
		}

		// Variables used to compute the Delaunay triangulation.
		this.delaunayTriangles = [];
		this.delaunayComplete = false;
		this.delaunayIndex = 0;

		// Variables used to compute the Voronoi diagram.
		this.voronoiComplete = false;
		this.voronoiEdges = [];

		if (!settings.stepByStep) {
			this.generate();
		}
	};
	
	/**
	 * Generate the diagram.
	 */
	Voronoi.prototype.generate = function () {
		// Prepare for the computation of the Delaunay triangulation
		this.initDelaunay(false);

		// Compute the Delaunay triangulation
		while (!this.delaunayComplete) {
			this.nextDelaunayStep(false);
		}

		// Compute the Voronoi diagram from the triangulation
		this.computeVoronoi();
	};

	/**
	 * Prepare for the computation of the Delaunay triangulation with the Bowyer-Watson algorithm.
	 */
	Voronoi.prototype.initDelaunay = function (draw) {
		// Create the seed triangle that surrounds all of the seeds
		var v1 = new Vertex(-this.width * 4, -this.height * 4);
		var v2 = new Vertex(this.width * 10, -this.height * 4);
		var v3 = new Vertex(-this.width * 4, this.height * 10);

		this.initialVertices = [];
		this.initialVertices[v1.id] = v1;
		this.initialVertices[v2.id] = v2;
		this.initialVertices[v3.id] = v3;

		var e1 = new Edge(v1, v2);
		var e2 = new Edge(v2, v3);
		var e3 = new Edge(v3, v1);

		var initialTriangle = new Triangle(
			[v1, v2, v3],
			[e1, e2, e3],
			[null, null, null]
		);

		this.delaunayTriangles.push(initialTriangle);
		// Push the vertices of the initial triangle to the end of the array of the seeds
		this.seeds = this.seeds.concat(initialTriangle.vertices);

		if (draw) {
			this.clearAndDrawDelaunayStep();
			//this.clearAndDrawDelaunayStep(ctx2);
			//this.clearAndDrawDelaunayStep(ctx3);
		}
	};

	/**
	 * Insert a new vertex in the Delaunay triangulation.
	 */
	Voronoi.prototype.nextDelaunayStep = function (draw) {
		if (this.delaunayIndex >= this.seeds.length - 3) {
			this.cleanUpDelaunay(draw);
		} else {
			var s = this.seeds[this.delaunayIndex];
			this.delaunayIndex += 1;

			var cavityTriangles = {};

			// Find the triangles that contain s in their circumscribing circle
			for (var i = 0; i < this.delaunayTriangles.length; i += 1) {
				var t = this.delaunayTriangles[i];
				if (t.circumcircleContains(s)) {
					cavityTriangles[t.id] = t;
				}
			}

			if (draw) {
				// Draw triangulation before insertion, showing the triangles to be deleted
				this.clearAndDrawDelaunayStep(s, cavityTriangles, null, null);
			}


			/* Insert the shop in the triangulation */

			var newEdges = {}, newEdgesToNewTriangles = {};
			var newTriangles = [], cavityEdges = [];

			for (var tId in cavityTriangles) {
				if (cavityTriangles.hasOwnProperty(tId)) {
					var t = cavityTriangles[tId];

					// Loop through the edges of the old triangle
					for (var i = 0; i < 3; i += 1) {
						var e = t.edges[i];
						var neighbour = t.getNeighbour(e);

						// If the neighbour is null or not a cavity triangle itself, create a new triangle using the shared edge
						if (neighbour === null || !cavityTriangles[neighbour.id]) {
							cavityEdges.push(e);

							/* Make sure we don't create edges that already exist */

							var sToV1 = newEdges[e.v1.id];
							var v2ToS = newEdges[e.v2.id];
							var sToV1Flag = false, v2ToSFlag = false;

							if (!sToV1) {
								sToV1Flag = true;
								sToV1 = new Edge(s, e.v1);
								newEdges[e.v1.id] = sToV1;
							}

							if (!v2ToS) {
								v2ToSFlag = true;
								v2ToS = new Edge(e.v2, s);
								newEdges[e.v2.id] = v2ToS;
							}

							// Create the new triangle
							var newT = new Triangle([s, e.v1, e.v2], [sToV1, e, v2ToS], [null, neighbour, null]);

							// Set new triangle as neighbour of the neighbour triangle
							if (neighbour !== null) {
								neighbour.setNeighbour(e, newT);
							}

							// Update neighbours for internal cavity edges
							if (sToV1Flag) {
								// Mark the edge as belonging to the new triangle
								newEdgesToNewTriangles[sToV1.id] = newT;
							} else {
								// The edge already belongs to another new triangle; retrieve that triangle
								var sToV1Neighbour = newEdgesToNewTriangles[sToV1.id];

								// Update neighbours in both triangles
								newT.setNeighbour(sToV1, sToV1Neighbour);
								sToV1Neighbour.setNeighbour(sToV1, newT);
							}

							if (v2ToSFlag) {
								// Mark the edge as belonging to the new triangle
								newEdgesToNewTriangles[v2ToS.id] = newT;
							} else {
								// The edge already belongs to another new triangle; retrieve that triangle
								var v2ToSNeighbour = newEdgesToNewTriangles[v2ToS.id];

								// Update neighbours in both triangles
								newT.setNeighbour(v2ToS, v2ToSNeighbour);
								v2ToSNeighbour.setNeighbour(v2ToS, newT);
							}


							// Save the new triangle
							newTriangles.push(newT);
							this.delaunayTriangles.push(newT);
						}
					}
				}
			}

			// Delete the old cavity triangles
			this.deleteTriangles(cavityTriangles);

			if (draw) {
				// Draw result of insertion in second canvas
				//this.clearAndDrawDelaunayStep(ctx2, s, null, cavityEdges, null);
				//this.clearAndDrawDelaunayStep(ctx3, s, null, null, newTriangles);
			}
		}
	};

	/**
	 * Clean-up the Delaunay triangulation by removing the initial triangle as well as the perimeter triangles.
	 */
	Voronoi.prototype.cleanUpDelaunay = function (draw) {
		this.delaunayComplete = true;

		// Find and remove the triangles on the perimeter of the triangulation
		var perimeterTriangles = [];
		var i, j, t;

		for (i = 0; i < this.delaunayTriangles.length; i += 1) {
			t = this.delaunayTriangles[i];

			for (j = 0; j < 3; j += 1) {
				if (this.initialVertices[t.vertices[j].id]) {
					perimeterTriangles.push(t);
					break;
				}
			}
		}

		if (draw) {
			//this.clearAndDrawDelaunayStep(ctx2);
			//this.clearAndDrawDelaunayStep(ctx3);
		}

		// Delete the perimeter triangles
		this.deleteTriangles(perimeterTriangles);

		// Remove the initial vertices
		this.seeds.splice(this.seeds.length - 3, 3);

		if (draw) {
			this.clearAndDrawDelaunayStep();
		}
	};

	/**
	 * Build the Voronoi diagram from the Delaunay triangulation.
	 */
	Voronoi.prototype.computeVoronoi = function () {
		this.voronoiComplete = true;

		var i, j, t, n;
		for (i = 0; i < this.delaunayTriangles.length; i += 1) {
			t = this.delaunayTriangles[i];
			for (j = 0; j < 3; j += 1) {
				n = t.getNeighbour(t.edges[j]);
				// Ensure the Voronoi edge hasn't already been created
				var nIndex = this.delaunayTriangles.indexOf(n);
				if (nIndex > i) {
					// Create the Voronoi edge between the circumcentres of the two triangles t and n
					var e = new Edge(
						new Vertex(t.circumX, t.circumY),
						new Vertex(n.circumX, n.circumY)
					);

					this.voronoiEdges.push(e);
				} else if (nIndex === -1) {
					// The neighbour is a triangle that has been deleted
					// i.e. this triangle is now on the perimeter of the Delaunay triangulation

					// Get the perimeter edge
					var e = t.edges[j];

					// Remove the neighbour, just to keep everything clean
					t.setNeighbour(e, null);

					// Find the equation of the edge's line (y = a1.x + b1); calculate the denominator first in case it's equal to 0
					var a1, b1, denom;
					denom = e.v1.x - e.v2.x;
					if (denom !== 0) {
						a1 = (e.v1.y - e.v2.y) / denom;
						b1 = e.v1.y - a1 * e.v1.x;
					} else {
						// The line is vertical; use the equation x = b1 instead
						a1 = null;
						b1 = e.v1.x;
					}

					// Get the coordinates of the middle of the edge
					var midX = e.v1.x + (e.v2.x - e.v1.x) / 2;
					var midY = e.v1.y + (e.v2.y - e.v1.y) / 2;

					// Deduce the equation of the line that is perpendicular to the middle of the edge (y = a2.x + b2)
					var a2, b2;
					if (a1 !== null) {
						if (a1 !== 0) {
							a2 = -1 / a1;
							b2 = midY - a2 * midX;
						} else {
							// The perpendicular is a vertical line
							a2 = null;
							b2 = midX;
						}
					} else {
						// The perpendicular is a horizontal line
						a2 = 0;
						b2 = midY;
					}

					// Find the vertex opposite to the edge
					var oppositeVertex = null;
					for (var k = 0; k < 3; k += 1) {
						var v = t.vertices[k];
						if (e.v1 != v && e.v2 != v) {
							oppositeVertex = v;
							break;
						}
					}

					var a3, b3, projX, coeff, chosenFar;

					if (a2 !== null) {
						if (a1 !== null) {
							a3 = a2;
							b3 = oppositeVertex.y - a3 * oppositeVertex.x;
							projX = (b3 - b1) / (a1 - a3);
						} else {
							projX = b1;
						}

						coeff = oppositeVertex.x < projX ? this.width : 0;
						chosenFar = new Vertex(coeff, a2 * coeff + b2);
					} else {
						var farY = oppositeVertex.y < midY ? this.height : 0;
						chosenFar = new Vertex(b2, farY);
					}

					// Create and store the Voronoi perimeter edge
					var newE = new Edge(new Vertex(t.circumX, t.circumY), chosenFar);
					this.voronoiEdges.push(newE);
				}
			}
		}
	};

	/**
	 * Delete some triangles from the Delaunay triangulation.
	 * @param {Array} triangles The triangles to delete.
	 */
	Voronoi.prototype.deleteTriangles = function (triangles) {
		for (var tId in triangles) {
			if (triangles.hasOwnProperty(tId)) {
				var t = triangles[tId];
				//t.draw(ctx2, true);
				//t.draw(ctx3, true);
				this.delaunayTriangles.splice(this.delaunayTriangles.indexOf(t), 1);
			}
		}
	};

	/**
	 * Clear the canvas.
	 */
	Voronoi.prototype.clear = function () {
		// Clear by drawing a white rectangle over the city
		this.ctx.fillStyle = this.settings.canvas.bgColour;
		this.ctx.fillRect(0, 0, this.width, this.height);
	};

	/**
	 * Draw the seeds of the diagram.
	 */
	Voronoi.prototype.drawSeeds = function () {
		for (var i = 0; i < this.seeds.length; i += 1) {
			this.seeds[i].draw(this.ctx, this.settings.canvas.seeds.radius);
		}
	};

	/**
	 * Draw some triangles.
	 * @param {Array} triangles The triangles to draw.
	 * @param {Boolean} fill Indicates whether to fill the triangles.
	 * @param {Boolean} stroke Indicates whether to stroke the edges of the triangles.
	 */
	Voronoi.prototype.drawTriangles = function (triangles, fill, stroke) {
		for (var i = 0; i < triangles.length; i += 1) {
			 triangles[i].draw(this.ctx, fill, stroke);
		}
	};

	/**
	 * Draw the Voronoi diagram of the city.
	 */
	Voronoi.prototype.drawVoronoi = function (showSeeds) {
		// Clear the canvas
		this.clear();

		// Draw the seeds
		if (showSeeds) {
			this.ctx.fillStyle = this.settings.canvas.seeds.colour;
			this.drawSeeds();
		}

		// Draw the Voronoi diagram
		this.ctx.strokeStyle = this.settings.canvas.voronoiEdges.colour;
		this.ctx.lineWidth = this.settings.canvas.voronoiEdges.width;
		this.ctx.lineCap = 'round';

		for (var i = 0; i < this.voronoiEdges.length; i += 1) {
			this.voronoiEdges[i].draw(this.ctx);
		}
	};

	/**
	 * Draw the Delaunay triangulation.
	 * @param {Boolean} showSeeds true to draw the seeds in the first context.
	 */
	Voronoi.prototype.drawDelaunay = function (showSeeds) {
		this.ctx.lineWidth = 1.0;
		this.ctx.strokeStyle = '#666666';

		this.drawTriangles(this.delaunayTriangles, false, true);
	};

	/**
	 * Clear the context and draw the current step of the creation of the Delaunay triangulation.
	 * @param {Vertex} shop A vertex that is to be drawn twice as big than the others.
	 * @param {Array} cavityTriangles The triangles that make up the current insertion cavity.
	 * @param {Array} cavityEdges The edges that form the perimeter of the current insertion cavity.
	 * @param {Array} newTriangles The new triangles that have been inserted into the triangulation.
	 */
	Voronoi.prototype.clearAndDrawDelaunayStep = function (shop, cavityTriangles, cavityEdges, newTriangles) {
		// Clear the context by drawing a white rectangle
		this.clear();

		// Draw old triangles
		if (cavityTriangles) {
			this.ctx.lineWidth = 3.0;
			this.ctx.strokeStyle = '#00ff00';
			this.ctx.fillStyle = '#ffcccc';
			for (var tId in cavityTriangles){
				if (cavityTriangles.hasOwnProperty(tId)) {
					cavityTriangles[tId].draw(this.ctx, true, true);
				}
			}
		}

		// Draw new triangles
		if (newTriangles) {
			this.ctx.lineWidth = 3.0;
			this.ctx.strokeStyle = '#cccc00';
			this.ctx.fillStyle = '#ccffcc';
			for (var i = 0; i < newTriangles.length; i++){
				newTriangles[i].draw(this.ctx, true, true);
			}
		}

		// Draw seeds
		this.ctx.fillStyle = '#ff3333';
		this.drawSeeds(shop);

		if (shop) {
			shop.draw(this.ctx, this.settings.canvas.seeds.radius * 2);
		}


		// Draw cavity edges
		if (cavityEdges) {
			this.this.ctx.lineWidth = 3.0;
			this.ctx.strokeStyle = "#0000ff";
			for (var i = 0; i < cavityEdges.length; i++){
				cavityEdges[i].draw(this.ctx);
			}
		}

		// Draw Delaunay triangles
		this.drawDelaunay();
	};

	/**
	 * For each context, clear then draw a representation of the Voronoi diagram of the city.
	 * @param {Boolean} showSeeds true to draw the seeds in the first context.
	 */
	/*
	Voronoi.prototype.redrawVoronoi = function (showSeeds) {
		// Draw the Voronoi diagram in the first canvas
		this.clear();
		if (showSeeds) {
			this.ctx.fillStyle = '#ff3333';
			this.drawSeeds();
		}
		this.drawVoronoi();

		// Draw the Voronoi diagram on top of the Delaunay triangulation in the second canvas
		//this.clear(ctx2);
		//this.drawSeeds(ctx2);
		//this.drawDelaunay(ctx2);
		//this.drawVoronoi(ctx2);

		// Draw the Delaunay triangulation in the third canvas
		//this.clear(ctx3);
		//this.drawSeeds(ctx3);
		//this.drawDelaunay(ctx3);
	};
	*/
	
	
	return Voronoi;
	
}());
