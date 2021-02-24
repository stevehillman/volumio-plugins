# Crestron Plugin for Volumio

This module provides a connection between Volumio and the TCPDaemon installed on a Crestron controller.

The TCPDaemon accepts HTTP-like commands that allow for getting and setting the state of digital and analog
inputs and outputs in the Crestron environment. 

This Crestron module uses that to set the power of the Crestron to "on" when this VolumIO starts playing. 
It could potentially perform other functions, such as changing the volume or modifying which source
is currently being played, but this would likely require customizing the VolumIO UI which is considerably
more complex

## More details on the TCPDaemon

Format of TCP Commands supported:
GET /digital/:id   - return the status of digital input ':id' e.g. "GET /digital/1"
GET /analog/:id    - return the value of an analog input
PUT /pulse/:id/1     - pulse a digital output high, then low
PUT /digital/:id/:value - set a digital output to the supplied value, which must be either 0 or 1
PUT /analog/:id/:value  - set an analog output to the supplied value, between 0 and 65535

NOTE: PUTting a 'digital' value will *hold* it at that value indefinitely, which may not be what is desired.
If simulating button pushes (power-on, mute, etc), /pulse is the right way to do it.

Results of the commands are returned in JSON format. For example:
{cmd="put",service="analog",id=1,value=2}

In addition, an 'event' response is sent back whenever an input changes state, as long as the connection
is open. Example:
{cmd:"event",service:"analog",id:15,value:13124}
