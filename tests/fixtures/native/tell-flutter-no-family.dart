import 'package:flutter/material.dart';
// Declares no fontFamily: Flutter renders Roboto, which IS the tell.
class NoFamily extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Text('Hello', style: TextStyle(fontSize: 18));
}
