import React, { useRef, useState, useImperativeHandle, useEffect } from "react";
import { View, PanResponder, StyleSheet } from "react-native";
import { captureRef } from "react-native-view-shot";
import Svg, { Path } from "react-native-svg";

// A reliable signature pad using SVG paths. It measures the view position
// and uses pageX/pageY to compute coordinates relative to the canvas to
// avoid offset/misalignment issues that can occur inside scrollviews
// or complex layouts.

const SignaturePad = React.forwardRef(({ style, strokeColor = "#000", strokeWidth = 3 }, ref) => {
  const [paths, setPaths] = useState([]); // each path is array of {x,y}
  const currentPath = useRef([]);
  const containerRef = useRef(null);
  const offset = useRef({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    clearSignature: () => {
      setPaths([]);
      currentPath.current = [];
    },
    readSignature: async () => {
      // If nothing drawn return null
      if (paths.length === 0 && currentPath.current.length === 0) return null;
      try {
        const uri = await captureRef(containerRef, {
          format: "png",
          quality: 0.9,
        });
        return uri;
      } catch (e) {
        return null;
      }
    },
    isEmpty: () => paths.length === 0 && currentPath.current.length === 0,
  }));

  useEffect(() => {
    // measure container absolute position for coordinate translation
    const measure = async () => {
      if (containerRef.current && containerRef.current.measureInWindow) {
        try {
          containerRef.current.measureInWindow((x, y) => {
            offset.current = { x, y };
          });
        } catch (e) {
          // ignore
        }
      }
    };
    measure();
    const t = setTimeout(measure, 500);
    return () => clearTimeout(t);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const x = pageX - offset.current.x;
        const y = pageY - offset.current.y;
        // begin a new stroke and add it to the paths array immediately
        const newStroke = [{ x, y }];
        currentPath.current = newStroke;
        setPaths((prev) => [...prev, newStroke]);
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const x = pageX - offset.current.x;
        const y = pageY - offset.current.y;
        // append point to the current stroke
        currentPath.current.push({ x, y });
        setPaths((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = [...currentPath.current];
          return copy;
        });
      },
      onPanResponderRelease: () => {
        // stroke already in paths; just clear our working ref
        currentPath.current = [];
      },
      onPanResponderTerminate: () => {
        // similar to release
        currentPath.current = [];
      },
    })
  ).current;

  // Helper to convert point arrays to SVG path string
  const pointsToSvgPath = (pts) => {
    if (!pts || !pts.length) return "";
    const d = pts.reduce((acc, p, i) => {
      const cmd = i === 0 ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}` : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      return acc + " " + cmd;
    }, "");
    return d;
  };

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
      collapsable={false}
      onLayout={() => {
        // refresh measurement on layout changes
        if (containerRef.current && containerRef.current.measureInWindow) {
          try {
            containerRef.current.measureInWindow((x, y) => {
              offset.current = { x, y };
            });
          } catch (e) {}
        }
      }}
      {...panResponder.panHandlers}
    >
      <Svg style={StyleSheet.absoluteFill}>
        {paths.map((pts, idx) => {
          const d = pointsToSvgPath(pts);
          return (
            <Path key={idx} d={d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          );
        })}
        {currentPath.current.length > 0 && (
          <Path d={pointsToSvgPath(currentPath.current)} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", overflow: "hidden" },
});

export default SignaturePad;
